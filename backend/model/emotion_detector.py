import numpy as np
import cv2
from PIL import Image
import random
import os

class EmotionDetector:
    """
    Emotion Detection using CNN (Keras / TensorFlow model)
    """
    
    def __init__(self, model_path=None):
        # Playlist-supported emotions
        self.emotions = ['happy', 'sad', 'angry', 'neutral', 'surprise']
        
        # Model-specific output classes in order
        self.model_classes = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
        
        self.model_path = model_path
        self.use_mock = True
        self.model = None
        
        # Load face cascade for cropping
        try:
            cascade_file = os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_default.xml')
            self.face_cascade = cv2.CascadeClassifier(cascade_file)
            print(f"Face cascade loaded successfully from {cascade_file}")
        except Exception as e:
            print(f"Error loading face cascade: {e}")
            self.face_cascade = None
        
        if model_path:
            self.load_model(model_path)
    
    def predict(self, image_array, mode='focus'):
        """
        Predict emotion from image array
        
        Args:
            image_array: numpy array of image (H, W, 3)
            mode: str ('focus' or 'group')
            
        Returns:
            emotion: str (emotion label)
            confidence: float (0-1)
            face_rect: dict (containing x, y, w, h of the primary/selected face) or None
            faces_detected: int (total faces found)
        """
        if self.use_mock or self.model is None:
            return self._mock_prediction(image_array, mode)
        else:
            return self._cnn_prediction(image_array, mode)
    
    def _mock_prediction(self, image_array, mode='focus'):
        """
        Mock prediction - returns random emotion and a mock face bounding box
        """
        emotion = random.choice(self.emotions)
        confidence = random.uniform(0.85, 0.98)
        
        # Create a mock face rect if the image is valid
        face_rect = None
        faces_detected = 0
        if len(image_array.shape) >= 2:
            h, w = image_array.shape[:2]
            # Mock a face in the middle
            fw, fh = int(w * 0.4), int(h * 0.5)
            fx, fy = int((w - fw) / 2), int((h - fh) / 2.5)
            face_rect = {"x": fx, "y": fy, "w": fw, "h": fh}
            faces_detected = 1
            if mode == 'group':
                faces_detected = 2
            
        print(f"[MOCK] Detected emotion: {emotion} (confidence: {confidence:.2f}, mode: {mode})")
        return emotion, confidence, face_rect, faces_detected
    
    def _map_emotion(self, emotion):
        """
        Map model output emotion to playlist-supported emotions
        """
        mapping = {
            'angry': 'angry',
            'disgust': 'sad',
            'fear': 'sad',
            'happy': 'happy',
            'neutral': 'neutral',
            'sad': 'sad',
            'surprise': 'surprise'
        }
        return mapping.get(emotion, 'neutral')
    
    def _cnn_prediction(self, image_array, mode='focus'):
        """
        Real Keras CNN prediction
        """
        try:
            import tensorflow as tf
            
            # Ensure the image is in uint8 format
            img_uint8 = image_array.astype('uint8')
            
            # Convert to grayscale if it's RGB
            if len(img_uint8.shape) == 3 and img_uint8.shape[2] == 3:
                gray = cv2.cvtColor(img_uint8, cv2.COLOR_RGB2GRAY)
            elif len(img_uint8.shape) == 3 and img_uint8.shape[2] == 4:
                gray = cv2.cvtColor(img_uint8, cv2.COLOR_RGBA2GRAY)
            else:
                gray = img_uint8
                
            img_h, img_w = gray.shape
            
            # Perform face detection and cropping if cascade is loaded
            faces = []
            if self.face_cascade is not None:
                faces = self.face_cascade.detectMultiScale(
                    gray, 
                    scaleFactor=1.1, 
                    minNeighbors=5, 
                    minSize=(30, 30)
                )
                
            if len(faces) == 0:
                print("[CNN] No face detected. Using whole image.")
                # Run prediction on whole image
                face_resized = cv2.resize(gray, (48, 48))
                
                # Normalize and predict
                img_input = face_resized.astype('float32') / 255.0
                img_input = np.expand_dims(img_input, axis=-1)
                img_input = np.expand_dims(img_input, axis=0)
                
                predictions = self.model.predict(img_input, verbose=0)
                predicted_idx = np.argmax(predictions[0])
                confidence = float(predictions[0][predicted_idx])
                
                model_emotion = self.model_classes[predicted_idx]
                mapped_emotion = self._map_emotion(model_emotion)
                
                return mapped_emotion, confidence, None, 0
                
            # Score each face based on size (area) and distance to the center
            center_x, center_y = img_w / 2.0, img_h / 2.0
            scored_faces = []
            for face in faces:
                x, y, w, h = face
                fx_center = x + w / 2.0
                fy_center = y + h / 2.0
                dist = np.sqrt((fx_center - center_x)**2 + (fy_center - center_y)**2)
                area = w * h
                score = area / (1.0 + 0.005 * dist)
                scored_faces.append((score, face))
                
            # Sort by score descending
            scored_faces = sorted(scored_faces, key=lambda x: x[0], reverse=True)
            
            if mode == 'group':
                # Group mode: Predict for all faces, average probabilities
                all_probs = []
                for score, face in scored_faces:
                    x, y, w, h = face
                    face_img = gray[y:y+h, x:x+w]
                    face_resized = cv2.resize(face_img, (48, 48))
                    
                    img_input = face_resized.astype('float32') / 255.0
                    img_input = np.expand_dims(img_input, axis=-1)
                    img_input = np.expand_dims(img_input, axis=0)
                    
                    predictions = self.model.predict(img_input, verbose=0)
                    all_probs.append(predictions[0])
                    
                avg_probs = np.mean(all_probs, axis=0)
                predicted_idx = np.argmax(avg_probs)
                confidence = float(avg_probs[predicted_idx])
                
                # Save primary face for debug
                primary_x, primary_y, primary_w, primary_h = scored_faces[0][1]
                primary_face_img = gray[primary_y:primary_y+primary_h, primary_x:primary_x+primary_w]
                primary_face_resized = cv2.resize(primary_face_img, (48, 48))
                try:
                    debug_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'debug_face.jpg')
                    cv2.imwrite(debug_path, primary_face_resized)
                except Exception as debug_err:
                    pass
                
                model_emotion = self.model_classes[predicted_idx]
                mapped_emotion = self._map_emotion(model_emotion)
                
                primary_face_rect = {
                    "x": int(primary_x),
                    "y": int(primary_y),
                    "w": int(primary_w),
                    "h": int(primary_h)
                }
                print(f"[CNN Group] Total faces: {len(faces)}. Avg predicted: {mapped_emotion} ({confidence:.2f})")
                return mapped_emotion, confidence, primary_face_rect, len(faces)
                
            else:
                # Focus mode (default): Predict for the highest scoring face (primary user)
                x, y, w, h = scored_faces[0][1]
                face_img = gray[y:y+h, x:x+w]
                face_resized = cv2.resize(face_img, (48, 48))
                
                # Save debug image
                try:
                    debug_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'debug_face.jpg')
                    cv2.imwrite(debug_path, face_resized)
                except Exception as debug_err:
                    print(f"Error saving debug image: {debug_err}")
                
                img_input = face_resized.astype('float32') / 255.0
                img_input = np.expand_dims(img_input, axis=-1)
                img_input = np.expand_dims(img_input, axis=0)
                
                predictions = self.model.predict(img_input, verbose=0)
                predicted_idx = np.argmax(predictions[0])
                confidence = float(predictions[0][predicted_idx])
                
                # Print full probability distribution for debugging
                prob_dict = {self.model_classes[i]: round(float(predictions[0][i]), 3) for i in range(len(self.model_classes))}
                print(f"[CNN] Probabilities: {prob_dict}")
                
                model_emotion = self.model_classes[predicted_idx]
                mapped_emotion = self._map_emotion(model_emotion)
                
                face_rect = {"x": int(x), "y": int(y), "w": int(w), "h": int(h)}
                print(f"[CNN Focus] Face selected at x:{x}, y:{y}, w:{w}, h:{h}. Predicted: {mapped_emotion} ({confidence:.2f})")
                return mapped_emotion, confidence, face_rect, len(faces)
                
        except Exception as e:
            print(f"Error in CNN prediction: {e}")
            return self._mock_prediction(image_array, mode)
    
    def load_model(self, model_path):
        """Load pre-trained Keras model (.h5)"""
        try:
            import tensorflow as tf
            if os.path.exists(model_path):
                self.model = tf.keras.models.load_model(model_path)
                self.use_mock = False
                print(f"Model loaded successfully from {model_path}")
            else:
                print(f"Model file not found at {model_path}, falling back to mock")
                self.use_mock = True
        except Exception as e:
            print(f"Error loading model from {model_path}: {e}")
            self.use_mock = True

# Export for use in Flask app
__all__ = ['EmotionDetector']