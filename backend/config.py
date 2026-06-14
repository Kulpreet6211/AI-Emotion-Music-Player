import os

class Config:
    """Base configuration"""
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
    FLASK_PORT = int(os.getenv('FLASK_PORT', 5000))
    DEBUG = FLASK_ENV == 'development'
    
    # CORS settings
    CORS_HEADERS = 'Content-Type'
    
    # Model settings
    MODEL_PATH = 'model/model_weights.pth'
    
    # Music settings
    MUSIC_DIR = 'music'
    PLAYLISTS_FILE = 'music/playlists.json'
    
    # Spotify settings
    SPOTIFY_CLIENT_ID = os.getenv('SPOTIFY_CLIENT_ID', '')
    SPOTIFY_CLIENT_SECRET = os.getenv('SPOTIFY_CLIENT_SECRET', '')
    SPOTIFY_REDIRECT_URI = os.getenv('SPOTIFY_REDIRECT_URI', 'http://127.0.0.1:5000/spotify/callback')

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}