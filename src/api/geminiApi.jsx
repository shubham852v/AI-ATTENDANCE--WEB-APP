// src/api/geminiApi.jsx
// This file contains functions to interact with the Google Gemini API for image processing and text generation.

// For local development with Vite, environment variables are accessed via import.meta.env.
// The variable names must be prefixed with VITE_ for Vite to expose them to the client-side bundle.
// Ensure VITE_GEMINI_API_KEY is set in your .env file in the project root.
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
// The base URL for the Gemini 2.0 Flash model.
const API_URL_FLASH = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

// --- DEBUGGING STEP: Log API_KEY before making calls ---
// This console log helps confirm if your VITE_GEMINI_API_KEY is being loaded correctly from your .env file.
// The key is partially obscured in the console output for security reasons.
console.log("Gemini API Key being used:", API_KEY ? `${API_KEY.substring(0, 5)}...${API_KEY.substring(API_KEY.length - 5)}` : "Not set");


/**
 * Calls the Gemini API to process an image and determine if a face is present.
 * This function now only confirms face detection, and does NOT generate a random name.
 * @param {string} capturedImageBase64 - The base64 encoded image data (a data URL, e.g., "data:image/png;base64,...").
 * @returns {Promise<{status: string, faceDetected: boolean, message: string}>} - A promise that resolves to an object
 * indicating the processing status, whether a face was detected, and a descriptive message.
 */
export async function processImageWithAI(capturedImageBase64) {
  // Pre-check: Ensure the API_KEY is configured before attempting to make an API call.
  if (!API_KEY) {
    console.error("Gemini API Key is not set for image processing. Please ensure VITE_GEMINI_API_KEY is in your .env file.");
    return { status: 'error', faceDetected: false, message: 'Gemini API Key is not configured.' };
  }

  // Extract the raw base64 data by removing the "data:image/png;base64," prefix.
  const base64ImageData = capturedImageBase64.split(',')[1];
  // Define the prompt that instructs the AI model on what to do with the image.
  // The prompt is changed to only ask for face detection.
  const prompt = "Analyze this image. If it contains a human face, respond with 'Face detected'. If no face is detected, respond with 'No face detected'. Format your response as a JSON object with 'status' and 'message' fields, e.g., {'status': 'success', 'message': 'Face detected'} or {'status': 'failure', 'message': 'No face detected'}.";

  // Structure the chat history for the Gemini API request payload.
  let chatHistory = [];
  chatHistory.push({ role: "user", parts: [{ text: prompt }] });

  // Define the full payload for the Gemini API call, including the image data and expected response schema.
  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt }, // The text prompt
          {
            inlineData: {
              mimeType: "image/png", // Specify the MIME type of the image
              data: base64ImageData // The base64 image data
            }
          }
        ]
      }
    ],
    generationConfig: {
        responseMimeType: "application/json", // Request the AI model to respond in JSON format
        responseSchema: { // Define the schema (structure) of the expected JSON response.
            type: "OBJECT",
            properties: {
                "status": { "type": "STRING" },    // Expected 'status' field (e.g., "success", "failure")
                "message": { "type": "STRING" } // Expected 'message' field (e.g., "Face detected", "No face detected")
            },
            "propertyOrdering": ["status", "message"] // Suggests the order of properties in the JSON.
        }
    }
  };

  try {
    // Make the API call to the Gemini model.
    const response = await fetch(API_URL_FLASH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // Indicate that the request body is JSON
      body: JSON.stringify(payload) // Convert the JavaScript payload object to a JSON string
    });

    // Check if the HTTP response was successful (status code in the 200-299 range).
    if (!response.ok) {
      const errorData = await response.json(); // Attempt to parse any error details from the response body.
      console.error("Gemini API HTTP Error for image processing:", response.status, response.statusText, errorData);
      // Return a user-friendly error message, including specific details from the API if available.
      return { status: 'error', faceDetected: false, message: `Gemini API Error: ${response.status} ${response.statusText}. Details: ${errorData.error?.message || JSON.stringify(errorData)}` };
    }

    const result = await response.json(); // Parse the successful API response into a JavaScript object.

    // Validate the structure of the AI's response to ensure it contains the expected data.
    if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
      const jsonResponse = result.candidates[0].content.parts[0].text; // Extract the text part which should be a JSON string.
      const parsedResponse = JSON.parse(jsonResponse);

      // Determine face detection status based on the message from the AI.
      const faceDetected = parsedResponse.message === 'Face detected';
      return { status: parsedResponse.status, faceDetected: faceDetected, message: parsedResponse.message };
    } else {
      // Handle cases where the AI response structure is unexpected or incomplete.
      console.error("AI API response structure unexpected for image processing:", result);
      return { status: 'error', faceDetected: false, message: 'AI processing failed: Invalid response structure.' };
    }
  } catch (error) {
    // Catch any network errors or exceptions that occur during the fetch operation.
    console.error("Error calling AI model for image processing:", error);
    return { status: 'error', faceDetected: false, message: `AI processing failed: ${error.message}.` };
  }
}

/**
 * Calls the Gemini API to generate an attendance summary based on provided logs.
 * @param {Array<Object>} attendanceLogs - An array of attendance log objects, each containing
 * 'personName' and 'timestamp' (Firestore Timestamp object or similar).
 * @returns {Promise<string>} - A promise that resolves to the generated summary text.
 */
export async function generateAttendanceSummary(attendanceLogs) {
  // Pre-check: Ensure the API_KEY is configured.
  if (!API_KEY) {
    console.error("Gemini API Key is not set for summary. Please ensure VITE_GEMINI_API_KEY is in your .env file.");
    throw new Error("Gemini API Key is not configured for summary generation.");
  }

  // Format the raw attendance log objects into a human-readable string for the LLM prompt.
  const formattedLogs = attendanceLogs.map(log => {
    // Safely convert Firestore Timestamp to a local date and time string.
    const date = log.timestamp && typeof log.timestamp.toDate === 'function' ? log.timestamp.toDate().toLocaleDateString() : 'Unknown Date';
    const time = log.timestamp && typeof log.timestamp.toDate === 'function' ? log.timestamp.toDate().toLocaleTimeString() : 'Unknown Time';
    return `- ${log.personName} on ${date} at ${time}`;
  }).join('\n'); // Join all formatted log entries with newlines.

  // Define the prompt for the LLM to summarize the attendance data.
  const prompt = `Given the following attendance records:\n${formattedLogs}\n\nProvide a concise summary of who attended, categorized by date, and mention the total count for each day. If multiple people attended on a day, list their names.`;

  // Prepare chat history for the API request.
  let chatHistory = [];
  chatHistory.push({ role: "user", parts: [{ text: prompt }] });

  const payload = { contents: chatHistory };
  // Using empty API key as Canvas will inject it at runtime.
  const apiKey = "";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API HTTP Error for summary:", response.status, response.statusText, errorData);
      throw new Error(`Gemini API Error: ${response.status} ${response.statusText}. Details: ${errorData.error?.message || JSON.stringify(errorData)}`);
    }

    const result = await response.json();

    if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
      return result.candidates[0].content.parts[0].text; // Return the generated summary.
    } else {
      console.error("AI API response structure unexpected for summary:", result);
      throw new Error("Failed to generate summary: Invalid AI response structure.");
    }
  } catch (error) {
    console.error("Error calling AI model for summary:", error);
    throw error;
  }
}

/**
 * Calls the Gemini API to generate a personalized welcome message for a person.
 * @param {string} personName - The name of the person for whom to generate the message.
 * @returns {Promise<string>} - A promise that resolves to the generated welcome message text.
 */
export async function generateWelcomeMessage(personName) {
  // Pre-check: Ensure the API_KEY is configured.
  if (!API_KEY) {
    console.error("Gemini API Key is not set for welcome message. Please ensure VITE_GEMINI_API_KEY is in your .env file.");
    throw new Error("Gemini API Key is not configured for welcome message generation.");
  }

  // Define the prompt for the LLM to create a friendly welcome message.
  const prompt = `Generate a friendly, brief welcome message for ${personName} who has just logged into an attendance system for an event/session. Make it sound welcoming and encouraging.`;

  // Prepare chat history for the API request.
  let chatHistory = [];
  chatHistory.push({ role: "user", parts: [{ text: prompt }] });

  const payload = { contents: chatHistory };
  // Using empty API key as Canvas will inject it at runtime.
  const apiKey = "";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API HTTP Error for welcome message:", response.status, response.statusText, errorData);
      throw new Error(`Gemini API Error: ${response.status} ${response.statusText}. Details: ${errorData.error?.message || JSON.stringify(errorData)}`);
    }

    const result = await response.json();

    if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
      return result.candidates[0].content.parts[0].text; // Return the generated text.
    } else {
      console.error("AI API response structure unexpected for welcome message:", result);
      throw new Error("Failed to generate welcome message: Invalid AI response structure.");
    }
  } catch (error) {
    console.error("Error calling AI model for welcome message:", error);
    throw error;
  }
}
