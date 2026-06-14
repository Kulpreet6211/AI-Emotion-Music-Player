from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import base64
import numpy as np
from PIL import Image
import io
import os
import json
import requests
import urllib.parse
from dotenv import load_dotenv
from datetime import datetime

# Import emotion detector (mock initially, then CNN)
from model.emotion_detector import EmotionDetector

load_dotenv()

app = Flask(__name__)
CORS(app)

# Get the directory where app.py is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Initialize emotion detector
model_path = os.path.join(BASE_DIR, 'model', 'fer2013_model.h5')
emotion_detector = EmotionDetector(model_path=model_path)

# Load music playlists
def load_playlists():
    playlist_path = os.path.join(BASE_DIR, 'music', 'playlists.json')
    print(f"Loading playlists from: {playlist_path}")
    with open(playlist_path, 'r') as f:
        return json.load(f)

PLAYLISTS = load_playlists()

# ==================== SPOTIFY CREDENTIALS ====================
SPOTIFY_CLIENT_ID = os.getenv('SPOTIFY_CLIENT_ID', '')
SPOTIFY_CLIENT_SECRET = os.getenv('SPOTIFY_CLIENT_SECRET', '')
SPOTIFY_REDIRECT_URI = os.getenv('SPOTIFY_REDIRECT_URI', 'http://127.0.0.1:5000/spotify/callback')

# ==================== SPOTIFY OAUTH ENDPOINTS ====================
@app.route('/spotify/login', methods=['GET'])
def spotify_login():
    """Redirect user to Spotify OAuth login page"""
    extension_id = request.args.get('extension_id', '')
    if not extension_id:
        return jsonify({'error': 'Missing extension_id parameter'}), 400
        
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        return jsonify({
            'error': 'Spotify credentials not configured on backend. Please add them to your .env file.',
            'status': 'unconfigured'
        }), 500
        
    scope = 'user-modify-playback-state user-read-playback-state user-read-currently-playing user-top-read'
    
    params = {
        'client_id': SPOTIFY_CLIENT_ID,
        'response_type': 'code',
        'redirect_uri': SPOTIFY_REDIRECT_URI,
        'scope': scope,
        'state': extension_id
    }
    
    auth_url = 'https://accounts.spotify.com/authorize?' + urllib.parse.urlencode(params)
    return jsonify({
        'auth_url': auth_url,
        'status': 'configured'
    }), 200

@app.route('/spotify/callback', methods=['GET'])
def spotify_callback():
    """Spotify redirects here with authorization code"""
    code = request.args.get('code')
    extension_id = request.args.get('state') # The state param holds extension_id
    error = request.args.get('error')
    
    if error:
        return f"Spotify authorization failed: {error}", 400
        
    if not code or not extension_id:
        return "Missing authorization code or extension state", 400
        
    # Exchange authorization code for tokens
    token_url = 'https://accounts.spotify.com/api/token'
    payload = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': SPOTIFY_REDIRECT_URI,
        'client_id': SPOTIFY_CLIENT_ID,
        'client_secret': SPOTIFY_CLIENT_SECRET
    }
    
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    
    try:
        response = requests.post(token_url, data=payload, headers=headers)
        if response.status_code != 200:
            return f"Error exchanging code: {response.text}", 400
            
        token_data = response.json()
        
        # Redirect back to chrome extension's dashboard with tokens in query params
        access_token = token_data.get('access_token')
        refresh_token = token_data.get('refresh_token')
        expires_in = token_data.get('expires_in')
        
        redirect_url = f"chrome-extension://{extension_id}/dashboard.html?" + urllib.parse.urlencode({
            'spotify_auth': 'success',
            'access_token': access_token,
            'refresh_token': refresh_token,
            'expires_in': expires_in
        })
        
        return f"""
        <html>
            <head>
                <title>Connecting to Spotify...</title>
                <script>
                    window.location.href = "{redirect_url}";
                </script>
            </head>
            <body style="background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
                <div style="text-align: center; background: #1e293b; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3); border: 1px solid #334155; max-width: 400px; width: 90%;">
                    <div style="font-size: 48px; margin-bottom: 20px;">🎵</div>
                    <h2 style="margin: 0 0 10px 0; font-size: 20px; font-weight: 600;">Connecting to your Spotify Account</h2>
                    <p style="margin: 0 0 24px 0; font-size: 14px; color: #94a3b8; line-height: 1.5;">Completing handshake with the Chrome Extension. You will be redirected automatically...</p>
                    <a href="{redirect_url}" style="display: inline-block; background: #1db954; color: white; text-decoration: none; padding: 12px 24px; border-radius: 9999px; font-weight: 600; font-size: 14px; transition: background 0.2s;">Open Extension Dashboard</a>
                </div>
            </body>
        </html>
        """
    except Exception as e:
        return f"Unexpected error during callback: {str(e)}", 500

@app.route('/spotify/refresh', methods=['POST'])
def spotify_refresh():
    """Refresh an expired Spotify access token"""
    data = request.get_json()
    if not data or 'refresh_token' not in data:
        return jsonify({'error': 'Missing refresh_token'}), 400
        
    refresh_token = data.get('refresh_token')
    token_url = 'https://accounts.spotify.com/api/token'
    payload = {
        'grant_type': 'refresh_token',
        'refresh_token': refresh_token,
        'client_id': SPOTIFY_CLIENT_ID,
        'client_secret': SPOTIFY_CLIENT_SECRET
    }
    
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    
    try:
        response = requests.post(token_url, data=payload, headers=headers)
        if response.status_code != 200:
            return jsonify({'error': f"Error refreshing token: {response.text}"}), response.status_code
            
        token_data = response.json()
        return jsonify({
            'access_token': token_data.get('access_token'),
            'expires_in': token_data.get('expires_in')
        }), 200
    except Exception as e:
        return jsonify({'error': f"Unexpected error: {str(e)}"}), 500

@app.route('/spotify/status', methods=['GET'])
def spotify_status():
    """Check if Spotify credentials are configured"""
    return jsonify({
        'configured': bool(SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET),
        'client_id_set': bool(SPOTIFY_CLIENT_ID),
        'redirect_uri': SPOTIFY_REDIRECT_URI,
        'status': 'ok' if (SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET) else 'unconfigured'
    }), 200

@app.route('/spotify/search', methods=['GET'])
def spotify_search():
    """Search for a track on Spotify by title + artist (proxy to avoid CORS issues)"""
    access_token = request.headers.get('Authorization', '').replace('Bearer ', '')
    title = request.args.get('title', '')
    artist = request.args.get('artist', '')
    
    if not access_token:
        return jsonify({'error': 'Missing Authorization header'}), 401
    if not title:
        return jsonify({'error': 'Missing title parameter'}), 400
    
    query = f"track:{title}"
    if artist:
        query += f" artist:{artist}"
    
    try:
        resp = requests.get(
            'https://api.spotify.com/v1/search',
            params={'q': query, 'type': 'track', 'limit': 1},
            headers={'Authorization': f'Bearer {access_token}'}
        )
        if resp.status_code != 200:
            return jsonify({'error': f'Spotify search error: {resp.text}'}), resp.status_code
        
        data = resp.json()
        tracks = data.get('tracks', {}).get('items', [])
        if not tracks:
            return jsonify({'found': False, 'spotify_uri': None}), 200
        
        track = tracks[0]
        return jsonify({
            'found': True,
            'spotify_uri': track['uri'],
            'track_name': track['name'],
            'artist': ', '.join(a['name'] for a in track['artists']),
            'external_url': track['external_urls']['spotify']
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== HEALTH CHECK ====================
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'service': 'emotion-music-player-api'
    }), 200

# ==================== EMOTION DETECTION ====================
@app.route('/emotion', methods=['POST'])
def detect_emotion():
    """
    Main emotion detection endpoint
    Expected input: Base64 encoded image and optional detection mode in JSON
    Returns: Emotion label, confidence score, face bounding box, and count of faces detected
    """
    try:
        # Get image from request
        data = request.get_json()
        
        if 'image' not in data:
            return jsonify({
                'error': 'No image provided',
                'status': 'failed'
            }), 400
        
        # Decode base64 image
        image_data = data['image']
        if image_data.startswith('data:image'):
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        image_array = np.array(image)
        
        # Get mode (default 'focus')
        mode = data.get('mode', 'focus')
        
        # Detect emotion
        emotion, confidence, face_rect, faces_detected = emotion_detector.predict(image_array, mode=mode)
        
        return jsonify({
            'emotion': emotion,
            'confidence': float(confidence),
            'face_rect': face_rect,
            'faces_detected': faces_detected,
            'status': 'success',
            'timestamp': datetime.now().isoformat()
        }), 200
        
    except Exception as e:
        return jsonify({
            'error': str(e),
            'status': 'failed'
        }), 500

# ==================== MUSIC RECOMMENDATION ====================
@app.route('/playlist/<language>/<emotion>', methods=['GET'])
def get_playlist(language, emotion):
    """
    Get music playlist for detected emotion
    """
    try:
        language = language.lower()
        emotion = emotion.lower()

          # Check language exists
        if language not in PLAYLISTS:
            return jsonify({
                'error': f'Language {language} not found',
                'available_languages': list(PLAYLISTS.keys())
                        }), 404

                # Check emotion exists inside language
        if emotion not in PLAYLISTS[language]:
            return jsonify({
                       'error': f'Emotion {emotion} not found for {language}',
                        'available_emotions': list(PLAYLISTS[language].keys())
                    }), 404

        playlist = PLAYLISTS[language][emotion]
        
        return jsonify({
            'emotion': emotion,
            'playlist': playlist,
            'song_count': len(playlist.get('songs', [])),
            'status': 'success'
        }), 200
        
    except Exception as e:
        return jsonify({
            'error': str(e),
            'status': 'failed'
        }), 500

# ==================== TEST ENDPOINTS ====================
@app.route('/test/emotions', methods=['GET'])
def test_emotions():
    """Get all supported emotions"""
    return jsonify({
        'supported_emotions': list(PLAYLISTS.keys()),
        'total': len(PLAYLISTS)
    }), 200

@app.route('/test/emotion-response/<emotion>', methods=['GET'])
def test_emotion_response(emotion):
    """Test emotion response without image"""
    emotion = emotion.lower()
    
    if emotion not in PLAYLISTS:
        return jsonify({
            'error': f'Emotion {emotion} not found'
        }), 404
    
    return jsonify({
        'emotion': emotion,
        'confidence': 0.95,
        'playlist': PLAYLISTS[emotion],
        'status': 'success'
    }), 200

# ==================== ERROR HANDLERS ====================
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

# ==================== MAIN ====================
if __name__ == '__main__':
    print(f"Base directory: {BASE_DIR}")
    print(f"Loading from: {os.path.join(BASE_DIR, 'music', 'playlists.json')}")
    app.run(
        host='0.0.0.0',
        port=int(os.getenv('FLASK_PORT', 5000)),
        debug=os.getenv('FLASK_ENV', 'development') == 'development'
    )
    