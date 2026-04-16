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