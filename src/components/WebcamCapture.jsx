// src/components/WebcamCapture.jsx
import React, { useRef, useState, useCallback, useEffect } from 'react';
// IMPORTANT: Ensure 'api' folder and 'geminiApi.jsx' file have the EXACT same casing and extension on your file system.
// This is the line that causes the error if the path/casing on your local file system is incorrect.
import { processImageWithAI } from '../api/geminiApi.jsx';

// Import necessary Firestore functions for adding documents
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

function WebcamCapture({ db, userId, setMessage }) {
  // useRef hooks to directly interact with DOM elements (video and canvas)
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  // State for SpeechRecognition API
  const speechRecognition = useRef(null);

  // State variables for managing webcam stream, captured image, processing, and voice input status
  const [stream, setStream] = useState(null); // Holds the MediaStream object from the webcam
  const [isCameraActive, setIsCameraActive] = useState(false); // True if webcam is currently active
  const [capturedImage, setCapturedImage] = useState(null); // Stores the base64 string of the captured image
  const [isProcessing, setIsProcessing] = useState(false); // True when AI processing or Firestore logging is ongoing
  const [faceDetectedByAI, setFaceDetectedByAI] = useState(false); // True if AI successfully detected a face
  const [isListeningForName, setIsListeningForName] = useState(false); // True when voice recognition is active
  const [recognizedName, setRecognizedName] = useState(''); // Stores the name recognized by speech input

  // Function to log attendance to Firestore using the recognized name (Moved to be declared BEFORE useEffect)
  const logAttendance = useCallback(async (nameToLog) => {
    if (!nameToLog) {
      setMessage("No name provided for attendance logging.");
      return;
    }
    if (!capturedImage) {
        setMessage("No image captured to log attendance against. Please retake.");
        return;
    }

    setMessage(`Logging attendance for ${nameToLog}...`);
    setIsProcessing(true); // Indicate logging process

    try {
      if (db && userId) {
        const appId = import.meta.env.VITE_FIREBASE_APP_ID || 'default-app-id';
        await addDoc(collection(db, `artifacts/${appId}/public/data/attendance`), {
          personName: nameToLog,
          timestamp: serverTimestamp(),
          image: capturedImage, // Keep the image on screen for user to review
          loggedByUserId: userId
        });
        setMessage(`Attendance logged successfully for ${nameToLog}!`);
        // Do NOT clear capturedImage here; let user click retake explicitly via retakeImage.
        setRecognizedName(''); // Clear recognized name once logged
        setFaceDetectedByAI(false); // Reset face detection status as attendance is complete
      } else {
        setMessage("Attendance logging not enabled (Firebase not ready or user not authenticated).");
      }
    } catch (error) {
      console.error("Error during attendance logging:", error);
      setMessage(`Error logging attendance: ${error.message}.`);
    } finally {
      setIsProcessing(false);
    }
  }, [db, userId, capturedImage, setMessage]);


  // Initialize SpeechRecognition API
  // This useEffect now correctly references logAttendance as it's declared above.
  useEffect(() => {
    // Check if the browser supports SpeechRecognition
    if ('webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.continuous = false; // Only listen for a single utterance
      recognition.interimResults = false; // Only return final results
      recognition.lang = 'en-US'; // Set recognition language

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log("Recognized speech:", transcript);
        setRecognizedName(transcript);
        setMessage(`Name recognized: ${transcript}. Logging attendance...`);
        setIsListeningForName(false);
        // Automatically log attendance after name is recognized
        logAttendance(transcript); // This call is now valid
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        setMessage(`Voice input error: ${event.error}. Please try again.`);
        setIsListeningForName(false);
        setRecognizedName(''); // Clear recognized name on error
      };

      recognition.onend = () => {
        setIsListeningForName(false);
      };

      speechRecognition.current = recognition;
    } else {
      setMessage("Speech recognition not supported in this browser. Please use Chrome or similar.");
      console.warn("webkitSpeechRecognition not available in this browser.");
    }
  }, [logAttendance]); // Depend on logAttendance to ensure the latest version of the function is used by onresult

  // Function to start the webcam stream
  const startCamera = async () => {
    setMessage(''); // Clear any previous messages
    setRecognizedName(''); // Clear any previously recognized name
    setCapturedImage(null); // Clear previous image
    setIsListeningForName(false); // Reset listening state
    setFaceDetectedByAI(false); // Reset AI detection state

    try {
      // Request access to the user's video input (webcam)
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = videoStream; // Assign the stream to the video element
        setStream(videoStream); // Store the stream in state
        setIsCameraActive(true); // Update camera active status
      }
    } catch (err) {
      console.error("Error accessing webcam:", err);
      setMessage("Error: Could not access webcam. Please ensure it's connected and permissions are granted.");
      setIsCameraActive(false); // Set camera active status to false on error
    }
  };

  // Function to stop the webcam stream (memoized with useCallback)
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop()); // Stop all tracks (video, audio) in the stream
      setStream(null); // Clear the stream from state
    }
    setIsCameraActive(false); // Update camera active status
    // Removed setCapturedImage(null) from here to ensure image persists for logging.
  }, [stream]); // Dependency: 'stream' ensures this callback is updated if the stream changes

  // Function to capture an image from the current video stream (memoized with useCallback)
  const captureImage = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current; // Ensure canvasRef.current is not null here
      const context = canvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageDataUrl = canvas.toDataURL('image/png');
      setCapturedImage(imageDataUrl); // Store the captured image in state
      stopCamera(); // Stop the camera after capturing the image to free resources
    } else {
      console.warn("Attempted to capture image, but videoRef or canvasRef were not ready.");
      setMessage("Camera or capture area not ready. Please try again.");
    }
  }, [stopCamera]); // Dependency: 'stopCamera' to ensure it uses the latest version of the function

  // Function to process the captured image with AI
  const handleProcessImage = useCallback(async () => {
    if (!capturedImage) {
      setMessage("No image captured to process.");
      return;
    }

    setIsProcessing(true);
    setMessage("Processing image with AI for face detection...");
    setFaceDetectedByAI(false); // Reset this before processing

    try {
      const aiResponse = await processImageWithAI(capturedImage);

      if (aiResponse.status === 'success' && aiResponse.faceDetected) {
        setFaceDetectedByAI(true);
        setMessage("Face detected! Please click 'Say My Name' to provide your name.");
        setRecognizedName(''); // Ensure name is cleared for new voice input
      } else {
        setFaceDetectedByAI(false);
        setMessage(`AI response: ${aiResponse.message || "No face detected"}. Please retake image.`);
        setRecognizedName(''); // Clear any previous name
      }
    } catch (error) {
      console.error("Error during AI processing:", error);
      setMessage(`Error during AI processing: ${error.message}.`);
      setFaceDetectedByAI(false);
    } finally {
      setIsProcessing(false);
    }
  }, [capturedImage, setMessage]);

  // Function to start voice input
  const startVoiceInput = () => {
    if (speechRecognition.current) {
      setIsListeningForName(true);
      setRecognizedName(''); // Clear previous recognition for new input
      setMessage("Listening for your name... Please speak clearly.");
      speechRecognition.current.start();
    } else {
      setMessage("Speech recognition not available. Please ensure your browser supports it (e.g., Chrome).");
    }
  };

  // Function to discard the captured image and restart the camera for a retake
  const retakeImage = () => {
    setCapturedImage(null); // Clear the captured image from state
    setRecognizedName(''); // Clear any recognized name
    setIsListeningForName(false); // Stop listening if active
    setFaceDetectedByAI(false); // Reset AI detection status
    stopCamera(); // Stop camera if active
    startCamera(); // Restart the camera feed
    setMessage('Ready for new attendance capture.'); // Reset message
  };

  // Cleanup stream on component unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (speechRecognition.current && isListeningForName) {
        speechRecognition.current.stop();
      }
    };
  }, [stream, isListeningForName]);

  return (
    <div className="bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 mb-6 w-full max-w-md flex flex-col items-center">
      <h2 className="text-xl sm:text-2xl font-semibold mb-4">Webcam Feed</h2>
      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-gray-700">
        {!isCameraActive && !capturedImage && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-lg">
            No camera feed
          </div>
        )}
        <video ref={videoRef} autoPlay muted playsInline className={`w-full h-full object-cover ${isCameraActive ? '' : 'hidden'}`}></video>
        {capturedImage && (
          <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
        )}
        <canvas ref={canvasRef} className="hidden"></canvas>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3 w-full">
        {/* State 1: No camera, no image - Show Start Camera */}
        {!isCameraActive && !capturedImage && (
          <button
            onClick={startCamera}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-all duration-200 ease-in-out transform hover:scale-105 active:scale-95 flex items-center justify-center min-w-[120px]"
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-4 2 2 4-4v6z"></path></svg>
            Start Camera
          </button>
        )}

        {/* State 2: Camera active - Show Capture */}
        {isCameraActive && (
          <button
            onClick={captureImage}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-all duration-200 ease-in-out transform hover:scale-105 active:scale-95 flex items-center justify-center min-w-[120px]"
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A1 1 0 009.172 3H6.828a1 1 0 00-.707.293L4.707 4.707A1 1 0 014 5zm3 6a3 3 0 116 0 3 3 0 01-6 0z" clipRule="evenodd"></path></svg>
            Capture
          </button>
        )}

        {/* State 3: Image captured, AI not processed (or failed) - Show Process with AI */}
        {capturedImage && !faceDetectedByAI && !isProcessing && !recognizedName && (
          <button
            onClick={handleProcessImage}
            disabled={isProcessing}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-all duration-200 ease-in-out transform hover:scale-105 active:scale-95 flex items-center justify-center min-w-[120px]"
          >
            {isProcessing ? (
              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l3 3a1 1 0 001.414-1.414L11 9.586V6z" clipRule="evenodd"></path></svg>
            )}
            {isProcessing ? 'Processing...' : 'Process with AI'}
          </button>
        )}

        {/* State 4: Image captured, AI processed (face detected), not listening, name not recognized yet - Show Say My Name */}
        {capturedImage && faceDetectedByAI && !isListeningForName && !isProcessing && !recognizedName && (
          <button
            onClick={startVoiceInput}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-all duration-200 ease-in-out transform hover:scale-105 active:scale-95 flex items-center justify-center min-w-[120px]"
            disabled={isListeningForName || isProcessing}
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7 6a3 3 0 016 0v5a3 3 0 01-6 0V6zm4 6a4 4 0 00-4 4v1a2 2 0 002 2h4a2 2 0 002-2v-1a4 4 0 00-4-4z" clipRule="evenodd"></path></svg>
            {isListeningForName ? 'Listening...' : 'Say My Name'}
          </button>
        )}

        {/* Retake button is always available if an image is captured or processing/listening is active */}
        {(capturedImage || isProcessing || isListeningForName) && (
          <button
            onClick={retakeImage}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-all duration-200 ease-in-out transform hover:scale-105 active:scale-95 flex items-center justify-center min-w-[120px]"
            disabled={isProcessing || isListeningForName} // Disable if currently processing AI or listening for voice
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd"></path></svg>
            Retake
          </button>
        )}
      </div>
    </div>
  );
}

export default WebcamCapture;
