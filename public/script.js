// API Base URL
const API_BASE_URL = "http://localhost:8080/api";

// Cookie management functions
function setCookie(name, value, days = 7) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(";");
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === " ") c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function deleteCookie(name) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
}

// Utility functions
function showStatus(elementId, message, type = "success") {
  const element = document.getElementById(elementId);
  element.innerHTML = `<div class="status ${type}">${message}</div>`;
  setTimeout(() => {
    element.innerHTML = "";
  }, 5000);
}

function showLoading(elementId) {
  const element = document.getElementById(elementId);
  element.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Loading...</p>
        </div>
    `;
}

function hideElement(elementId) {
  document.getElementById(elementId).classList.add("hidden");
}

function showElement(elementId) {
  document.getElementById(elementId).classList.remove("hidden");
}

function toggleForm(formType) {
  if (formType === "signup") {
    hideElement("loginForm");
    showElement("signupForm");
  } else {
    hideElement("signupForm");
    showElement("loginForm");
  }
}

// API functions
async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong");
    }

    return data;
  } catch (error) {
    throw error;
  }
}

// Authentication functions
async function signup() {
  const username = document.getElementById("signupUsername").value;
  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;
  const firstName = document.getElementById("signupFirstName").value;
  const lastName = document.getElementById("signupLastName").value;

  if (!username || !email || !password) {
    showStatus("signupStatus", "Please fill in all required fields", "error");
    return;
  }

  try {
    showLoading("signupStatus");

    const userData = await makeRequest(`${API_BASE_URL}/users`, {
      method: "POST",
      body: JSON.stringify({
        username,
        email,
        password,
        firstName,
        lastName,
      }),
    });

    // Store user ID in cookie
    setCookie("userId", userData._id);
    setCookie("userEmail", userData.email);
    setCookie("username", userData.username);

    showStatus(
      "signupStatus",
      "Account created successfully! Redirecting to dashboard...",
      "success"
    );

    setTimeout(() => {
      showDashboard();
    }, 2000);
  } catch (error) {
    showStatus("signupStatus", error.message, "error");
  }
}

async function login() {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    showStatus("loginStatus", "Please fill in all fields", "error");
    return;
  }

  try {
    showLoading("loginStatus");

    // For demo purposes, we'll try to find a user by email
    // In a real app, you'd have a proper login endpoint
    const users = await makeRequest(`${API_BASE_URL}/users`);
    const user = users.find((u) => u.email === email);

    if (!user) {
      throw new Error("User not found");
    }

    // In a real app, you'd verify the password here
    // For demo, we'll just check if the user exists

    // Store user data in cookies
    setCookie("userId", user._id);
    setCookie("userEmail", user.email);
    setCookie("username", user.username);

    showStatus(
      "loginStatus",
      "Login successful! Redirecting to dashboard...",
      "success"
    );

    setTimeout(() => {
      showDashboard();
    }, 2000);
  } catch (error) {
    showStatus("loginStatus", error.message, "error");
  }
}

function logout() {
  // Clear cookies
  deleteCookie("userId");
  deleteCookie("userEmail");
  deleteCookie("username");

  // Show login form
  hideElement("dashboard");
  showElement("loginForm");

  // Clear form fields
  document.getElementById("loginEmail").value = "";
  document.getElementById("loginPassword").value = "";
}

// Dashboard functions
async function showDashboard() {
  const userId = getCookie("userId");

  if (!userId) {
    showElement("loginForm");
    return;
  }

  hideElement("loginForm");
  hideElement("signupForm");
  showElement("dashboard");

  await loadUserData();
}

async function loadUserData() {
  const userId = getCookie("userId");

  if (!userId) {
    logout();
    return;
  }

  try {
    showLoading("userInfo");

    const userData = await makeRequest(`${API_BASE_URL}/users/${userId}`);

    displayUserInfo(userData);
  } catch (error) {
    showStatus("dashboardStatus", error.message, "error");
  }
}

function displayUserInfo(userData) {
  const userInfoDiv = document.getElementById("userInfo");

  userInfoDiv.innerHTML = `
        <div class="info-row">
            <span class="info-label">Username:</span>
            <span class="info-value">${userData.username}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Email:</span>
            <span class="info-value">${userData.email}</span>
        </div>
        <div class="info-row">
            <span class="info-label">First Name:</span>
            <span class="info-value">${
              userData.firstName || "Not provided"
            }</span>
        </div>
        <div class="info-row">
            <span class="info-label">Last Name:</span>
            <span class="info-value">${
              userData.lastName || "Not provided"
            }</span>
        </div>
        <div class="info-row">
            <span class="info-label">User ID:</span>
            <span class="info-value">${userData._id}</span>
        </div>
        <div class="info-row">
            <span class="info-label">LinkedIn Token:</span>
            <span class="info-value">${
              userData.linkedin && userData.linkedin.accessToken
                ? "✅ Connected"
                : "❌ Not connected"
            }</span>
        </div>
        <div class="info-row">
            <span class="info-label">Created:</span>
            <span class="info-value">${new Date(
              userData.createdAt
            ).toLocaleDateString()}</span>
        </div>
    `;
}

async function saveLinkedInToken() {
  const userId = getCookie("userId");
  const accessToken = document.getElementById("accessToken").value;
  const refreshToken = document.getElementById("refreshToken").value;
  const expiresAt = document.getElementById("expiresAt").value;

  if (!accessToken) {
    showStatus("linkedinStatus", "Please enter an access token", "error");
    return;
  }

  try {
    showLoading("linkedinStatus");

    const tokenData = {
      accessToken,
      refreshToken: refreshToken || undefined,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      tokenType: "Bearer",
    };

    await makeRequest(`${API_BASE_URL}/users/${userId}/linkedin-token`, {
      method: "POST",
      body: JSON.stringify(tokenData),
    });

    showStatus(
      "linkedinStatus",
      "LinkedIn token saved successfully!",
      "success"
    );

    // Clear form
    document.getElementById("accessToken").value = "";
    document.getElementById("refreshToken").value = "";
    document.getElementById("expiresAt").value = "";

    // Refresh user data
    await loadUserData();
  } catch (error) {
    showStatus("linkedinStatus", error.message, "error");
  }
}

async function refreshUserData() {
  await loadUserData();
  showStatus("dashboardStatus", "Data refreshed successfully!", "success");
}

// Check if user is already logged in on page load
document.addEventListener("DOMContentLoaded", function () {
  const userId = getCookie("userId");

  if (userId) {
    showDashboard();
  } else {
    showElement("loginForm");
  }
});

// Add keyboard shortcuts
document.addEventListener("keydown", function (event) {
  // Enter key in login form
  if (
    event.key === "Enter" &&
    !document.getElementById("loginForm").classList.contains("hidden")
  ) {
    login();
  }

  // Enter key in signup form
  if (
    event.key === "Enter" &&
    !document.getElementById("signupForm").classList.contains("hidden")
  ) {
    signup();
  }
});
