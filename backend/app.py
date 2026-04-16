from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import base64
import numpy as np
from PIL import Image
import io
import os
import json
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
emotion_detector = EmotionDetector()

# Load music playlists
def load_playlists():
    playlist_path = os.path.join(BASE_DIR, 'music', 'playlists.json')
    print(f"Loading playlists from: {playlist_path}")
    with open(playlist_path, 'r') as f:
        return json.load(f)

PLAYLISTS = load_playlists()

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
    Expected input: Base64 encoded image in JSON
    Returns: Emotion label with confidence score
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
        
        # Detect emotion
        emotion, confidence = emotion_detector.predict(image_array)
        
        return jsonify({
            'emotion': emotion,
            'confidence': float(confidence),
            'status': 'success',
            'timestamp': datetime.now().isoformat()
        }), 200
        
    except Exception as e:
        return jsonify({
            'error': str(e),
            'status': 'failed'
        }), 500

# ==================== MUSIC RECOMMENDATION ====================
@app.route('/playlist/<emotion>', methods=['GET'])
def get_playlist(emotion):
    """
    Get music playlist for detected emotion
    """
    try:
        emotion = emotion.lower()
        
        if emotion not in PLAYLISTS:
            return jsonify({
                'error': f'Emotion {emotion} not found',
                'available_emotions': list(PLAYLISTS.keys())
            }), 404
        
        playlist = PLAYLISTS[emotion]
        
        return jsonify({
            'emotion': emotion,
            'playlist': playlist,
            'song_count': len(playlist['songs']),
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
    