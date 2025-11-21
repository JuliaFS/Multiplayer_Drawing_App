// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB4fA_Ve9NX5ErzZZefBUpKv71PjbTgnhU",
  authDomain: "my-drawing-app-cca43.firebaseapp.com",
  projectId: "my-drawing-app-cca43",
  storageBucket: "my-drawing-app-cca43.firebasestorage.app",
  messagingSenderId: "50774768554",
  appId: "1:50774768554:web:f78bb8c4d7b250a38749d3"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// firebase.ts
// import { initializeApp } from "firebase/app";
// import { getFirestore } from "firebase/firestore";

// const firebaseConfig = {
//   apiKey: "...",
//   authDomain: "...",
//   projectId: "...",
//   storageBucket: "...",
//   messagingSenderId: "...",
//   appId: "...",
// };

// const app = initializeApp(firebaseConfig);
// export const db = getFirestore(app);
