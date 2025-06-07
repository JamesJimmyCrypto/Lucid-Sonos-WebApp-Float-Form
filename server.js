// server.js
const express = require('express');
const request = require('request');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const podStreams = {
  pod1: '',
  pod2: '',
  pod3: '',
  pod4: '',
  pod5: '',
  pod6: ''
};

// API to assign Lucid HLS URL to a specific pod
app.post('/api/assign', (req, res) => {
  const { pod, lucid_url } = req.body;
  if (!pod || !lucid_url || !podStreams.hasOwnProperty(pod)) {
    return res.status(400).send('Missing or invalid pod or URL.');
  }
  podStreams[pod] = lucid_url;
  res.redirect('/assign');
});

// Serve playlist.m3u8 with rewritten segment URLs pointing to our proxy
app.get('/experiences/:pod/hls/playlist.m3u8', (req, res) => {
  const { pod } = req.params;
  const url = podStreams[pod];
  if (!url) return res.status(404).send('No stream assigned to this pod.');

  request.get(url, (err, _, body) => {
    if (err || !body) return res.status(502).send('Error fetching playlist');

    const proxyBase = `/experiences/${pod}/hls/`;
    const rewritten = body.replace(
      /https:\/\/[^/]+\/[^/]+\/[^/]+\/([^"\n]+)/g,
      proxyBase + '$1'
    );

    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(rewritten);
  });
});

// Serve .ts segment files via proxy
app.get('/experiences/:pod/hls/:segment', (req, res) => {
  const { pod, segment } = req.params;
  const playlistUrl = podStreams[pod];
  if (!playlistUrl) return res.status(404).send('No track assigned');

  const baseUrl = playlistUrl.replace('/playlist.m3u8', '/');
  const tsUrl = baseUrl + segment;

  request.get(tsUrl)
    .on('error', () => res.status(502).send('Error loading segment'))
    .pipe(res);
});

// Return current pod assignment statuses (used by UI)
app.get('/status', (req, res) => {
  res.json(podStreams);
});

// Serve original WebApp UI
app.get('/assign', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ NEW: Route to serve mood-form.html without needing .html
app.get('/mood-form', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mood-form.html'));
});

// Forward POST /api/lucid-proxy to Lucid API with Bearer token
const LUCID_API_KEY = 'd0d7512b-6392-434c-a723-8a44690be542';

app.post('/api/lucid-proxy', (req, res) => {
  const { endpoint, method, body } = req.body;
  const url = `https://proxy.core.thelucidproject.ca${endpoint}`;

  console.log('➡️ Forwarding to Lucid:', {
    method: method || 'POST',
    url,
    body
  });

  request({
    url,
    method: method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'api-key': LUCID_API_KEY
    },
    body: JSON.stringify(body)
  }, (error, response, responseBody) => {
if (error) {
  console.error('❌ Proxy error to Lucid:', error);
  return res.status(500).json({ error: 'Proxy error', details: error.toString() });
}

    try {
    const contentType = response.headers['content-type'] || '';

    if (contentType.includes('application/json')) {
        const json = JSON.parse(responseBody);
        console.log(`✅ Lucid responded (${response.statusCode}):`, json);
        res.status(response.statusCode).json(json);
    } else {
        console.log(`✅ Lucid responded with non-JSON (${response.statusCode}):`, responseBody);
        res.status(response.statusCode).send(responseBody); // send raw text (e.g. URL)
    }
    } catch (e) {
    console.error(`❌ Unexpected error parsing Lucid response (${response.statusCode}):`, responseBody);
    res.status(response.statusCode).json({ error: 'Proxy decode error', raw: responseBody });
    }
  });
});


// Start server
app.listen(3000, () => {
  console.log('✅ Lucid Proxy Server running at http://localhost:3000');
});
