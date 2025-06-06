// src/App.jsx
import React, { useEffect, useState } from "react";
// ***********************************************************************************
// IMPORTANT: Please verify these paths and casing on your local file system:
// - The folder 'firebase' directly inside 'src' should be named EXACTLY 'firebase' (all lowercase).
// - The file 'firebaseConfig.jsx' inside 'src/firebase' should be named EXACTLY 'firebaseConfig.jsx'.
//   (e.g., if it's 'FirebaseConfig.jsx' or 'firebaseconfig.jsx' on your disk, you must rename it).
// ***********************************************************************************
import { initializeFirebase, signInUser, db, appId } from "./firebase/firebaseConfig.jsx";

// ***********************************************************************************
// IMPORTANT: Please verify these paths and casing on your local file system:
// - The folder 'components' directly inside 'src' should be named EXACTLY 'components' (all lowercase).
// - The file 'WebcamCapture.jsx' inside 'src/components' should be named EXACTLY 'WebcamCapture.jsx'.
//   (e.g., if it's 'webcamcapture.jsx' on your disk, you must rename it).
// ***********************************************************************************
import WebcamCapture from "./components/WebcamCapture.jsx";

// ***********************************************************************************
// IMPORTANT: Please verify these paths and casing on your local file system:
// - The folder 'components' directly inside 'src' should be named EXACTLY 'components' (all lowercase).
// - The file 'AttendanceLog.jsx' inside 'src/components' should be named EXACTLY 'AttendanceLog.jsx'.
//   (e.g., if it's 'attendancelog.jsx' on your disk, you must rename it).
// ***********************************************************************************
import AttendanceLog from "./components/AttendanceLog.jsx";

function App() {
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const { auth, unsubscribe } = initializeFirebase(setUserId, setMessage, setIsAuthReady);
    const setupAuth = async () => {
      if (auth && !userId) {
        try {
          await signInUser(auth);
        } catch (error) {
          console.error("Initial sign-in failed:", error);
        }
      }
    };
    setupAuth();
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-800 to-indigo-900 text-white font-inter p-4 sm:p-6 flex flex-col items-center">
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <h1 className="text-3xl sm:text-4xl font-bold mb-6 text-center">
        AI-Powered Smart Attendance System
      </h1>
      <p className="text-sm text-center mb-4 opacity-80">
        Logged in as: <span className="font-mono break-all">{userId || "Authenticating..."}</span>
      </p>
      <WebcamCapture db={db} userId={userId} setMessage={setMessage} />
      <AttendanceLog db={db} userId={userId} setMessage={setMessage} />
      {message && (
        <p className="mt-4 text-center text-sm px-2 py-1 rounded-md bg-yellow-700 bg-opacity-70 text-yellow-100">
          {message}
        </p>
      )}
    </div>
  );
}

export default App;
