// src/firebase/firebaseConfig.jsx
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Global variables provided by the Canvas environment (used when running in Canvas)
// These will be 'undefined' when running locally on your machine.
const canvasAppId = typeof __app_id !== 'undefined' ? __app_id : undefined;
const canvasFirebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : undefined;
const canvasInitialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined;

// Attempt to parse environment variables from .env for local development (Vite specific)
let localFirebaseConfig = {};
try {
  // Check if the VITE_FIREBASE_CONFIG environment variable is set
  if (import.meta.env.VITE_FIREBASE_CONFIG) {
    // Parse the JSON string into an object. This is critical for reading the config.
    localFirebaseConfig = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG);
  }
} catch (e) {
  // Log an error if parsing fails, usually due to malformed JSON in .env
  console.error("Error parsing VITE_FIREBASE_CONFIG from .env:", e);
  console.warn("Please ensure VITE_FIREBASE_CONFIG in your .env is a single-line, valid JSON string.");
  localFirebaseConfig = {}; // Ensure it's an empty object on parse failure to prevent crashes
}

// Determine the final configuration values based on the environment:
// 1. Prioritize Canvas globals if available (when running in Canvas).
// 2. Fallback to Vite environment variables for local development.
// 3. Provide a default fallback value if neither is available.
const appId = canvasAppId || import.meta.env.VITE_FIREBASE_APP_ID || 'default-app-id';
const firebaseConfig = canvasFirebaseConfig || localFirebaseConfig; // Use Canvas config or locally parsed config
const initialAuthToken = canvasInitialAuthToken || import.meta.env.VITE_INITIAL_AUTH_TOKEN || null;

// Firebase App, Auth, and Firestore instances
let app;
let auth;
let db;

// --- DEBUGGING STEP: Log firebaseConfig before initialization ---
// This console log is very important for debugging your .env setup.
// Check your browser's console for the output of this line.
console.log("Firebase config being used:", firebaseConfig);

// Only initialize Firebase if a valid configuration object is available
// A valid config must be a non-empty object and contain an 'apiKey'.
if (Object.keys(firebaseConfig).length > 0 && firebaseConfig.apiKey) {
  try {
    app = initializeApp(firebaseConfig); // Initialize the Firebase app
    auth = getAuth(app); // Get the Firebase Auth instance
    db = getFirestore(app); // Get the Firestore database instance
    console.log("Firebase initialized successfully!"); // Confirmation message
  } catch (initError) {
    // Catch errors during Firebase initialization (e.g., invalid config)
    console.error("Error initializing Firebase App:", initError);
    console.warn("Firebase initialization failed. Services will not function.");
    // Provide dummy objects to prevent further errors if initialization fails
    auth = { currentUser: null, signInAnonymously: async () => ({ user: { uid: 'anonymous-dummy' } }), onAuthStateChanged: () => () => {} };
    db = {};
  }
} else {
  // Log a warning if no valid Firebase config is provided
  console.warn("Firebase configuration not provided or invalid. Firebase services will not be initialized.");
  // Provide dummy objects to prevent crashes if Firebase is not initialized
  auth = { currentUser: null, signInAnonymously: async () => ({ user: { uid: 'anonymous-dummy' } }), onAuthStateChanged: () => () => {} };
  db = {};
}

/**
 * Initializes Firebase authentication listener.
 * This function sets up a real-time listener for authentication state changes.
 * @param {Function} setUserId - React state setter for userId.
 * @param {Function} setMessage - React state setter for general messages.
 * @param {Function} setIsAuthReady - React state setter for auth readiness flag.
 * @returns {{auth: Object, unsubscribe: Function}} - Firebase auth instance and unsubscribe function.
 */
export const initializeFirebase = (setUserId, setMessage, setIsAuthReady) => {
  // Critical check: Ensure auth and db objects are valid before setting up listeners.
  // If Firebase failed to initialize (due to bad config), these might be dummy objects.
  if (!auth || !db || Object.keys(firebaseConfig).length === 0 || !firebaseConfig.apiKey) {
    console.warn("Firebase is not initialized. Authentication and Firestore operations will not function.");
    setIsAuthReady(true); // Mark as ready even if not initialized, to prevent app from hanging
    return { auth: null, unsubscribe: () => {} }; // Return dummy values
  }

  // Set up the authentication state change listener
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (user) {
      // If a user is signed in, set their UID
      setUserId(user.uid);
    } else {
      // If no user is signed in, attempt to sign in.
      // Prioritize custom token (if provided), otherwise sign in anonymously.
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Firebase authentication error during onAuthStateChanged:", error);
        setMessage("Failed to authenticate. Please try again.");
      }
    }
    setIsAuthReady(true); // Mark authentication as ready after the initial check
  });

  return { auth, unsubscribe }; // Return auth instance and unsubscribe function
};

/**
 * Attempts to sign in the user. Used for initial authentication after Firebase setup.
 * @param {Object} authInstance - The Firebase Auth instance.
 */
export const signInUser = async (authInstance) => {
  // Validate authInstance before proceeding
  if (!authInstance) {
    console.warn("Auth instance not available for sign in in signInUser.");
    return;
  }
  // If a user is already signed in, no need to perform sign-in again
  if (authInstance.currentUser) {
    // console.log("User already signed in:", authInstance.currentUser.uid);
    return;
  }

  try {
    // Attempt sign-in using custom token or anonymously based on 'initialAuthToken'
    if (initialAuthToken) {
      await signInWithCustomToken(authInstance, initialAuthToken);
    } else {
      await signInAnonymously(authInstance);
    }
  } catch (error) {
    console.error("Error signing in with Firebase:", error);
    throw error; // Re-throw to allow calling component to handle errors if needed
  }
};

// Export the initialized auth, db, and appId instances for use throughout the application
export { auth, db, appId };
