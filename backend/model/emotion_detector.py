import numpy as np
import cv2
from PIL import Image
import random

class EmotionDetector:
    """
    Emotion Detection using CNN
    Phase 1: Mock implementation with random predictions
    Phase 2: Real CNN model implementation
    """
    
    def __init__(self, model_path=None):
        self.emotions = ['happy', 'sad', 'angry', 'neutral', 'surprise']
        self.model_path = model_path
        
        # Phase 1: Mock detection
        self.use_mock = True
        
        if model_path and not self.use_mock:
            self.load_model(model_path)
    
    def predict(self, image_array):
        """
        Predict emotion from image array
        
        Args:
            image_array: numpy array of image (H, W, 3)
            
        Returns:
            emotion: str (emotion label)
            confidence: float (0-1)
        """
        
        if self.use_mock:
            return self._mock_prediction(image_array)
        else:
            return self._cnn_prediction(image_array)
    
    def _mock_prediction(self, image_array):
        """
        Mock prediction - returns random emotion
        Replace this with real CNN model later
        """
        # Simulate processing
        emotion = random.choice(self.emotions)
        confidence = random.uniform(0.85, 0.98)
        
        print(f"[MOCK] Detected emotion: {emotion} (confidence: {confidence:.2f})")
        
        return emotion, confidence
    
    def _cnn_prediction(self, image_array):
        """
        Real CNN prediction (implement in Phase 2)
        """
        try:
            import torch
            import torchvision.transforms as transforms
            
            # Convert to tensor
            image = Image.fromarray(image_array.astype('uint8'))
            
            # Preprocess
            transform = transforms.Compose([
                transforms.Resize((48, 48)),
                transforms.Grayscale(),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.5], std=[0.5])
            ])
            
            image_tensor = transform(image).unsqueeze(0)
            
            # Model prediction
            with torch.no_grad():
                outputs = self.model(image_tensor)
                probabilities = torch.nn.functional.softmax(outputs, dim=1)
                confidence, predicted = torch.max(probabilities, 1)
            
            emotion = self.emotions[predicted.item()]
            confidence = confidence.item()
            
            return emotion, confidence
            
        except Exception as e:
            print(f"Error in CNN prediction: {e}")
            return "neutral", 0.5
    
    def load_model(self, model_path):
        """Load pre-trained CNN model"""
        try:
            import torch
            self.model = torch.load(model_path)
            self.model.eval()
            self.use_mock = False
            print(f"Model loaded from {model_path}")
        except Exception as e:
            print(f"Error loading model: {e}")
            self.use_mock = True

# Export for use in Flask app
__all__ = ['EmotionDetector']