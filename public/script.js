/* =========================================================
   SMARTCIVIC - FRONTEND
   Connected with SmartCivic Node/Express Backend
========================================================= */

const API = "/api";

let token = localStorage.getItem("smartcivic_token");
let currentUser = null;

let adminMap = null;
let categoryChart = null;
let cameraStream = null;
let currentFacingMode = "environment";

/* =========================================================
   BASIC HELPERS
========================================================= */

function $(id) {
    return document.getElementById(id);
}

function showPage(pageId) {

    document.querySelectorAll(".page").forEach(page => {
        page.classList.add("hidden");
        page.classList.remove("active");
    });

    const page = $(pageId);

    if (page) {
        page.classList.remove("hidden");
        page.classList.add("active");
    }
}

function showToast(message) {

    const toast = $("toast");
    const toastMessage = $("toastMessage");

    if (!toast || !toastMessage) return;

    toastMessage.textContent = message;

    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

function escapeHTML(value) {

    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(date) {

    if (!date) return "-";

    try {
        return new Date(date).toLocaleString("en-IN", {
            dateStyle: "medium",
            timeStyle: "short"
        });
    } catch {
        return date;
    }
}

async function apiRequest(
    url,
    options = {}
) {

    const headers = {
        ...(options.headers || {})
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(
        API + url,
        {
            ...options,
            headers
        }
    );

    let data;

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {

        if (response.status === 401) {
            logout(false);
        }

        throw new Error(
            data.message ||
            "Something went wrong."
        );
    }

    return data;
}

/* =========================================================
   AUTH
========================================================= */

async function loginUser(email, password) {

    const data = await apiRequest(
        "/auth/login",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email,
                password
            })
        }
    );

    token = data.token;
    currentUser = data.user;

    localStorage.setItem(
        "smartcivic_token",
        token
    );

    localStorage.setItem(
        "smartcivic_user",
        JSON.stringify(currentUser)
    );

    routeUser();

    showToast(
        `Welcome ${currentUser.name}!`
    );
}

/* =========================================================
   EMAIL VERIFICATION REGISTER
========================================================= */

let registrationEmailVerified = false;
let registrationVerifiedEmail = "";
let registrationOtpRequired = false;


/* SEND REGISTRATION OTP */

async function sendRegistrationOTP() {

    const email =
        $("registerEmail")
            .value
            .trim()
            .toLowerCase();

    if (!email) {

        showToast(
            "Please enter your email."
        );

        return;
    }

    const sendButton = $("sendRegistrationOTPButton");
    if (sendButton) sendButton.disabled = true;

    try {

        const data =
            await apiRequest(
                "/auth/send-verification-otp",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        email
                    })
                }
            );

        showToast(
            data.message ||
            "OTP generated successfully."
        );

        $("registerOTPSection")
            ?.classList
            .remove("hidden");

        $("registerOTPMessage").textContent = "";

        $("registerOTP")
            ?.focus();

    } catch (error) {

        console.error(
            "Registration OTP error:",
            error
        );

        showToast(
            error.message ||
            "Unable to send OTP."
        );
    } finally {
        if (sendButton) sendButton.disabled = false;
    }
}


/* VERIFY REGISTRATION OTP */

async function verifyRegistrationOTP() {

    const email =
        $("registerEmail")
            .value
            .trim()
            .toLowerCase();

    const otp =
        $("registerOTP")
            .value
            .trim();

    if (!email) {
        showToast("Please enter your email.");
        return;
    }

    if (!/^\d{6}$/.test(otp)) {
        showToast("OTP must be exactly 6 digits.");
        return;
    }

    try {

        const data =
            await apiRequest(
                "/auth/verify-email-otp",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        email,
                        otp
                    })
                }
            );

        registrationEmailVerified = true;
        registrationVerifiedEmail = email;

        const message =
            $("registerOTPMessage");

        if (message) {
            message.textContent =
                "✅ Email verified successfully.";

            message.style.color = "green";
        }

        const button =
            $("createAccountButton");

        if (button) {
            button.disabled = false;
            button.textContent =
                "🚀 Create Account";
        }

        const sendButton = $("sendRegistrationOTPButton");
        if (sendButton) sendButton.disabled = true;

        showToast(
            data.message ||
            "Email verified successfully."
        );

    } catch (error) {

        registrationEmailVerified = false;
        registrationVerifiedEmail = "";

        console.error(
            "Registration OTP verification error:",
            error
        );

        const message =
            $("registerOTPMessage");

        if (message) {
            message.textContent =
                "❌ " +
                (
                    error.message ||
                    "Invalid OTP."
                );

            message.style.color = "red";
        }

        showToast(
            error.message ||
            "Invalid OTP."
        );
    }
}
/* =========================================================
   REGISTER USER
========================================================= */

async function registerUser(
    name,
    email,
    mobile,
    password
) {

    await apiRequest(
        "/auth/register",
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({
                name,
                email,
                mobile,
                password
            })
        }
    );

    showToast(
        "Account created successfully!"
    );

    showLogin();
}
async function loadCurrentUser() {

    if (!token) {
        showLogin();
        return;
    }

    try {

        currentUser =
            await apiRequest(
                "/auth/me"
            );

        localStorage.setItem(
            "smartcivic_user",
            JSON.stringify(currentUser)
        );

        routeUser();

    } catch (error) {

        console.error(error);

        logout(false);
    }
}

function routeUser() {

    if (!currentUser) {
        showLogin();
        return;
    }

    if (currentUser.role === "admin") {

        showPage("adminDashboard");

        loadAdminDashboard();

        return;
    }

    if (currentUser.role === "ngo") {

        showPage("ngoDashboard");

        loadNGODashboard();

        return;
    }

    showPage("citizenDashboard");

    updateCitizenUI();

    loadCitizenComplaints();
}

function logout(showMessage = true) {

    token = null;
    currentUser = null;

    localStorage.removeItem(
        "smartcivic_token"
    );

    localStorage.removeItem(
        "smartcivic_user"
    );

    showPage("loginPage");

    if (showMessage) {
        showToast("Logged out successfully.");
    }
}

/* =========================================================
   LOGIN / REGISTER UI
========================================================= */

function showLogin() {

    showPage("loginPage");

    const form = $("loginForm");

    if (form) {
        form.reset();
    }
}

function showRegister() {

    showPage("registerPage");

    const form = $("registerForm");

    if (form) {
        form.reset();
    }

    registrationEmailVerified = false;
    registrationVerifiedEmail = "";
    configureRegistrationOTP();
}

async function configureRegistrationOTP() {
    const status = $("registerEmailStatus");
    const controls = $("registerOTPControls");
    const createButton = $("createAccountButton");

    registrationEmailVerified = false;
    registrationVerifiedEmail = "";
    registrationOtpRequired = true;
    if (createButton) createButton.disabled = true;
    if (status) status.textContent = "Checking email verification settings…";
    if (controls) controls.classList.add("hidden");

    try {
        const health = await apiRequest("/health");
        registrationOtpRequired = Boolean(health.emailConfigured);

        if (registrationOtpRequired) {
            if (status) status.textContent = "Verify your email address before creating your account.";
            if (controls) controls.classList.remove("hidden");
            if (createButton) createButton.disabled = true;
        } else {
            if (status) status.textContent = "Email verification is not configured yet. Account creation is available without email verification.";
            if (createButton) createButton.disabled = false;
        }
    } catch (error) {
        registrationOtpRequired = true;
        if (status) status.textContent = "Could not check email verification. Please reload and try again.";
        if (createButton) createButton.disabled = true;
    }
}

function invalidateRegistrationEmailVerification() {
    registrationEmailVerified = false;
    registrationVerifiedEmail = "";

    const otpSection = $("registerOTPSection");
    if (otpSection) otpSection.classList.add("hidden");
    const otpInput = $("registerOTP");
    if (otpInput) otpInput.value = "";
    const message = $("registerOTPMessage");
    if (message) message.textContent = "";
    const createButton = $("createAccountButton");
    if (createButton) createButton.disabled = registrationOtpRequired;
    const sendButton = $("sendRegistrationOTPButton");
    if (sendButton) sendButton.disabled = false;
}

/* =========================================================
   CITIZEN UI
========================================================= */

function updateCitizenUI() {

    if (!currentUser) return;

    if ($("citizenName")) {
        $("citizenName").textContent =
            currentUser.name;
    }

    if ($("welcomeName")) {
        $("welcomeName").textContent =
            currentUser.name;
    }
}

/* =========================================================
   REGISTER FORM
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        const loginForm =
            $("loginForm");

        if (loginForm) {

            loginForm.addEventListener(
                "submit",
                async function (event) {

                    event.preventDefault();

                    const email =
                        $("loginEmail").value.trim();

                    const password =
                        $("loginPassword").value;

                    try {

                        await loginUser(
                            email,
                            password
                        );

                    } catch (error) {

                        showToast(
                            error.message
                        );
                    }
                }
            );
        }

        const registerForm =
            $("registerForm");

        if (registerForm) {

            $("registerEmail")?.addEventListener(
                "input",
                invalidateRegistrationEmailVerification
            );

            registerForm.addEventListener(
                "submit",
                async function (event) {

                    event.preventDefault();

                    const name =
                        $("registerName").value.trim();

                    const email =
                        $("registerEmail").value.trim();

                    const mobile =
                        $("registerMobile").value.trim();

                    const password =
                        $("registerPassword").value;

                    const confirmPassword =
                        $("registerConfirmPassword").value;

                    const cleanEmail = email.toLowerCase();

                    if (
                        registrationOtpRequired &&
                        (
                            !registrationEmailVerified ||
                            registrationVerifiedEmail !== cleanEmail
                        )
                    ) {
                        showToast("Verify this email address before creating your account.");
                        return;
                    }

                    if (password !== confirmPassword) {
                        showToast("Passwords do not match.");
                        return;
                    }

                    try {

                        await registerUser(
                            name,
                            email,
                            mobile,
                            password
                        );

                    } catch (error) {

                        showToast(
                            error.message
                        );
                    }
                }
            );
        }

        const complaintForm =
            $("complaintForm");

        if (complaintForm) {

            complaintForm.addEventListener(
                "submit",
                submitComplaint
            );
        }

        const photoInput =
            $("complaintPhoto");

        if (photoInput) {

            photoInput.addEventListener(
                "change",
                handleGalleryPhoto
            );
        }

        const adminSearch =
            $("adminSearch");

        if (adminSearch) {

            adminSearch.addEventListener(
                "input",
                renderAdminComplaints
            );
        }

        const statusFilter =
            $("statusFilter");

        if (statusFilter) {

            statusFilter.addEventListener(
                "change",
                renderAdminComplaints
            );
        }

        const priorityFilter =
            $("priorityFilter");

        if (priorityFilter) {

            priorityFilter.addEventListener(
                "change",
                renderAdminComplaints
            );
        }

        loadCurrentUser();
    }
);

/* =========================================================
   COMPLAINT MODAL
========================================================= */

function openComplaintModal() {

    $("complaintModal")
        ?.classList
        .remove("hidden");

    clearComplaintForm();
}

function closeComplaintModal() {

    $("complaintModal")
        ?.classList
        .add("hidden");

    stopCamera();
}

function clearComplaintForm() {

    const form =
        $("complaintForm");

    if (form) {
        form.reset();
    }

    if ($("photoPreview")) {
        $("photoPreview")
            .classList
            .add("hidden");
    }

    if ($("locationStatus")) {
        $("locationStatus")
            .textContent =
            "Location not selected.";
    }

    if ($("mapLink")) {
        $("mapLink").style.display =
            "none";
    }

    if ($("latitude")) {
        $("latitude").value = "";
    }

    if ($("longitude")) {
        $("longitude").value = "";
    }

    if ($("areaName")) {
        $("areaName").value = "";
    }
}

/* =========================================================
   PHOTO GALLERY
========================================================= */

function handleGalleryPhoto(event) {

    const file =
        event.target.files[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {

        showToast(
            "Please select an image."
        );

        return;
    }

    showPhotoPreview(file);
}

function showPhotoPreview(file) {

    const reader =
        new FileReader();

    reader.onload = function (event) {

        $("previewImage").src =
            event.target.result;

        $("photoPreview")
            .classList
            .remove("hidden");
    };

    reader.readAsDataURL(file);
}

function removePhoto() {

    if ($("complaintPhoto")) {
        $("complaintPhoto").value = "";
    }

    if ($("previewImage")) {
        $("previewImage").src = "";
    }

    $("photoPreview")
        ?.classList
        .add("hidden");
}

/* =========================================================
   CAMERA
========================================================= */

async function openCameraModal() {

    $("cameraModal")
        ?.classList
        .remove("hidden");

    await startCamera();
}

async function startCamera() {

    stopCamera();

    const video =
        $("cameraVideo");

    const placeholder =
        $("cameraPlaceholder");

    const message =
        $("cameraMessage");

    try {

        cameraStream =
            await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode:
                        currentFacingMode
                },
                audio: false
            });

        video.srcObject =
            cameraStream;

        video.style.display =
            "block";

        placeholder.style.display =
            "none";

        message.textContent =
            "Camera ready. Capture a photo.";

    } catch (error) {

        console.error(error);

        message.textContent =
            "Camera permission denied or camera unavailable.";

        showToast(
            "Camera permission is required."
        );
    }
}

function stopCamera() {

    if (cameraStream) {

        cameraStream
            .getTracks()
            .forEach(track => {
                track.stop();
            });

        cameraStream = null;
    }

    const video =
        $("cameraVideo");

    if (video) {
        video.srcObject = null;
        video.style.display =
            "none";
    }

    const placeholder =
        $("cameraPlaceholder");

    if (placeholder) {
        placeholder.style.display =
            "block";
    }
}

function closeCameraModal() {

    stopCamera();

    $("cameraModal")
        ?.classList
        .add("hidden");
}

async function switchCamera() {

    currentFacingMode =
        currentFacingMode === "environment"
            ? "user"
            : "environment";

    await startCamera();
}

function capturePhoto() {

    if (!cameraStream) {

        showToast(
            "Camera is not active."
        );

        return;
    }

    const video =
        $("cameraVideo");

    const canvas =
        $("cameraCanvas");

    canvas.width =
        video.videoWidth;

    canvas.height =
        video.videoHeight;

    const context =
        canvas.getContext("2d");

    context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
    );

    canvas.toBlob(
        function (blob) {

            const file =
                new File(
                    [blob],
                    "camera-evidence.jpg",
                    {
                        type:
                            "image/jpeg"
                    }
                );

            showPhotoPreview(file);

            const dataTransfer =
                new DataTransfer();

            dataTransfer.items.add(file);

            $("complaintPhoto").files =
                dataTransfer.files;

            closeCameraModal();

            showToast(
                "Photo captured successfully."
            );
        },
        "image/jpeg",
        0.88
    );
}

/* =========================================================
   GPS LOCATION
========================================================= */

function getCurrentLocation() {

    if (!navigator.geolocation) {

        showToast(
            "GPS is not supported by this browser."
        );

        return;
    }

    $("locationStatus")
        .textContent =
        "📍 Getting your location...";

    navigator.geolocation.getCurrentPosition(
        async function (position) {

            const lat =
                position.coords.latitude;

            const lon =
                position.coords.longitude;

            $("latitude").value =
                lat;

            $("longitude").value =
                lon;

            $("locationStatus")
                .textContent =
                `📍 Location captured: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;

            const mapLink =
                $("mapLink");

            mapLink.href =
                `https://www.google.com/maps?q=${lat},${lon}`;

            mapLink.style.display =
                "inline-block";

            await reverseGeocode(
                lat,
                lon
            );
        },

        function (error) {

            console.error(error);

            $("locationStatus")
                .textContent =
                "Unable to get location.";

            showToast(
                "Please allow location permission."
            );
        },

        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

async function reverseGeocode(
    latitude,
    longitude
) {

    try {

        const response =
            await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            );

        if (!response.ok) return;

        const data =
            await response.json();

        const address =
            data.display_name ||
            "GPS Location";

        $("areaName").value =
            address;

    } catch (error) {

        console.log(
            "Area detection unavailable."
        );

        $("areaName").value =
            "GPS Location";
    }
}

/* =========================================================
   SUBMIT COMPLAINT
========================================================= */

async function submitComplaint(event) {

    event.preventDefault();

    if (!currentUser) {

        showToast(
            "Please login first."
        );

        return;
    }

    const category =
        $("complaintCategory").value;

    const title =
        $("complaintTitle").value.trim();

    const description =
        $("complaintDescription")
            .value
            .trim();

    const latitude =
        $("latitude").value;

    const longitude =
        $("longitude").value;

    const areaName =
        $("areaName").value;

    const anonymous =
        $("hideName").checked;

    if (!category || !title || !description) {

        showToast(
            "Please fill all required fields."
        );

        return;
    }

    const formData =
        new FormData();

    formData.append(
        "category",
        category
    );

    formData.append(
        "title",
        title
    );

    formData.append(
        "description",
        description
    );

    formData.append(
        "latitude",
        latitude
    );

    formData.append(
        "longitude",
        longitude
    );

    formData.append(
        "areaName",
        areaName
    );

    formData.append(
        "anonymous",
        anonymous
            ? "true"
            : "false"
    );

    const photo =
        $("complaintPhoto")
            ?.files[0];

    if (photo) {

        formData.append(
            "photo",
            photo
        );
    }

    const submitButton =
        event.submitter;

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent =
            "Submitting...";
    }

    try {

        const data =
            await apiRequest(
                "/complaints",
                {
                    method: "POST",
                    body: formData
                }
            );

        closeComplaintModal();

        showToast(
            `Complaint ${data.complaint.id} submitted successfully!`
        );

        await loadCitizenComplaints();

    } catch (error) {

        console.error(error);

        showToast(
            error.message
        );

    } finally {

        if (submitButton) {

            submitButton.disabled =
                false;

            submitButton.textContent =
                "🚀 Submit Complaint";
        }
    }
}

/* =========================================================
   CITIZEN COMPLAINTS
========================================================= */

let citizenComplaints = [];

async function loadCitizenComplaints() {

    try {

        citizenComplaints =
            await apiRequest(
                "/complaints/my"
            );

        updateCitizenStats();

        renderCitizenComplaints();

    } catch (error) {

        console.error(error);

        showToast(
            error.message
        );
    }
}

function updateCitizenStats() {

    const total =
        citizenComplaints.length;

    const pending =
        citizenComplaints.filter(
            c =>
                ![
                    "Resolved",
                    "Rejected"
                ].includes(c.status)
        ).length;

    const progress =
        citizenComplaints.filter(
            c =>
                [
                    "Assigned",
                    "In Progress"
                ].includes(c.status)
        ).length;

    const resolved =
        citizenComplaints.filter(
            c =>
                c.status === "Resolved"
        ).length;

    if ($("totalComplaints")) {
        $("totalComplaints")
            .textContent = total;
    }

    if ($("pendingComplaints")) {
        $("pendingComplaints")
            .textContent = pending;
    }

    if ($("progressComplaints")) {
        $("progressComplaints")
            .textContent = progress;
    }

    if ($("resolvedComplaints")) {
        $("resolvedComplaints")
            .textContent = resolved;
    }
}

function renderCitizenComplaints() {

    const tbody =
        $("recentComplaintsBody");

    if (!tbody) return;

    if (!citizenComplaints.length) {

        tbody.innerHTML = `
            <tr>
                <td colspan="7"
                    style="text-align:center;">
                    No complaints yet.
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML =
        citizenComplaints
            .map(c => {

                const priorityClass =
                    String(c.priority || "")
                        .toLowerCase();

                return `
                    <tr>

                        <td>
                            <b>${escapeHTML(c.id)}</b>
                        </td>

                        <td>
                            ${escapeHTML(c.category)}
                        </td>

                        <td>
                            <span class="status-badge ${priorityClass}">
                                ${escapeHTML(c.priority)}
                            </span>
                        </td>

                        <td>
                            <span class="status-badge">
                                ${escapeHTML(c.status)}
                            </span>
                        </td>

                        <td>
                            ${escapeHTML(c.deadline || "-")}
                        </td>

                        <td>
                            ${escapeHTML(c.duplicate_count || 1)}
                        </td>

                        <td>
                            <button
                                class="small-btn"
                                onclick="openComplaintDetail('${c.id}')">
                                View
                            </button>
                        </td>

                    </tr>
                `;
            })
            .join("");
}

/* =========================================================
   DETAIL MODAL
========================================================= */

async function openComplaintDetail(id) {

    try {

        const data =
            await apiRequest(
                `/complaints/${encodeURIComponent(id)}`
            );

        const c =
            data.complaint;

        const events =
            data.events || [];

        let timeline =
            events
                .map(event => `
                    <div class="event-item">
                        <b>
                            ${escapeHTML(event.action)}
                        </b>

                        <p>
                            ${escapeHTML(event.note || "")}
                        </p>

                        <small>
                            ${formatDate(event.created_at)}
                        </small>
                    </div>
                `)
                .join("");

        $("complaintDetail").innerHTML = `

            <div class="detail-grid">

                <div>
                    <h3>
                        ${escapeHTML(c.title)}
                    </h3>

                    <p>
                        ${escapeHTML(c.description)}
                    </p>
                </div>

                <div>
                    <b>ID</b>
                    <p>${escapeHTML(c.id)}</p>
                </div>

                <div>
                    <b>Category</b>
                    <p>${escapeHTML(c.category)}</p>
                </div>

                <div>
                    <b>Priority</b>
                    <p>${escapeHTML(c.priority)}</p>
                </div>

                <div>
                    <b>Status</b>
                    <p>${escapeHTML(c.status)}</p>
                </div>

                <div>
                    <b>Department</b>
                    <p>${escapeHTML(c.department)}</p>
                </div>

                <div>
                    <b>Area</b>
                    <p>${escapeHTML(c.area_name)}</p>
                </div>

                <div>
                    <b>AI Confidence</b>
                    <p>
                        ${
                            c.ai_confidence
                                ? Math.round(
                                    c.ai_confidence * 100
                                ) + "%"
                                : "-"
                        }
                    </p>
                </div>

            </div>

            ${
                c.photo_url
                    ? `
                        <div style="margin-top:20px;">
                            <h3>📷 Evidence</h3>
                            <img
                                src="${c.photo_url}"
                                style="
                                    max-width:100%;
                                    max-height:400px;
                                    border-radius:12px;
                                    margin-top:10px;
                                "
                            >
                        </div>
                    `
                    : ""
            }

            ${
                c.status === "Resolved"
                    ? `
                        <button
                            class="primary-btn"
                            style="margin-top:20px;"
                            onclick="reopenComplaint('${c.id}')">
                            🔄 Reopen Complaint
                        </button>
                    `
                    : ""
            }

            <div style="margin-top:25px;">
                <h3>📜 Complaint Timeline</h3>

                <div class="timeline">
                    ${timeline || "No events."}
                </div>
            </div>
        `;

        $("detailModal")
            .classList
            .remove("hidden");

    } catch (error) {

        showToast(
            error.message
        );
    }
}

function closeDetailModal() {

    $("detailModal")
        ?.classList
        .add("hidden");
}

/* =========================================================
   REOPEN COMPLAINT
========================================================= */

async function reopenComplaint(id) {

    const reason =
        prompt(
            "Why do you want to reopen this complaint?"
        );

    if (!reason) return;

    try {

        await apiRequest(
            `/complaints/${encodeURIComponent(id)}/reopen`,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    reason
                })
            }
        );

        closeDetailModal();

        showToast(
            "Complaint reopened."
        );

        loadCitizenComplaints();

    } catch (error) {

        showToast(
            error.message
        );
    }
}

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

let adminComplaints = [];

async function loadAdminDashboard() {

    try {

        const [
            complaints,
            analytics
        ] = await Promise.all([
            apiRequest("/complaints"),
            apiRequest("/analytics")
        ]);

        adminComplaints =
            complaints;

        updateAdminStats(
            analytics
        );

        renderAdminComplaints();

        renderCategoryChart(
            analytics.categories
        );

        initAdminMap();

        await loadAdminMap();

    } catch (error) {

        console.error(error);

        showToast(
            error.message
        );
    }
}

function updateAdminStats(data) {

    $("adminTotal").textContent =
        data.total || 0;

    $("adminPending").textContent =
        data.pending || 0;

    $("adminEmergency").textContent =
        data.emergency || 0;

    $("adminResolved").textContent =
        data.resolved || 0;

    $("adminBreached").textContent =
        data.breached || 0;

    $("adminNGO").textContent =
        data.ngoEscalated || 0;

    $("resolutionRate").textContent =
        `${data.resolutionRate || 0}%`;
}

/* =========================================================
   ADMIN TABLE
========================================================= */

function renderAdminComplaints() {

    const tbody =
        $("adminComplaintsBody");

    if (!tbody) return;

    const search =
        ($("adminSearch")?.value || "")
            .toLowerCase();

    const status =
        $("statusFilter")?.value ||
        "all";

    const priority =
        $("priorityFilter")?.value ||
        "all";

    const filtered =
        adminComplaints.filter(
            c => {

                const matchesSearch =
                    !search ||
                    JSON.stringify(c)
                        .toLowerCase()
                        .includes(search);

                const matchesStatus =
                    status === "all" ||
                    c.status === status;

                const matchesPriority =
                    priority === "all" ||
                    c.priority === priority;

                return (
                    matchesSearch &&
                    matchesStatus &&
                    matchesPriority
                );
            }
        );

    if (!filtered.length) {

        tbody.innerHTML = `
            <tr>
                <td colspan="8"
                    style="text-align:center;">
                    No complaints found.
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML =
        filtered
            .map(c => {

                return `
                    <tr>

                        <td>
                            <b>${escapeHTML(c.id)}</b>
                        </td>

                        <td>
                            ${escapeHTML(c.citizen_name)}
                        </td>

                        <td>
                            ${escapeHTML(c.category)}
                        </td>

                        <td>
                            ${escapeHTML(c.department)}
                        </td>

                       <td>
    <span class="status-badge ${
        c.status === "Reopened"
            ? "reopened-status"
            : ""
    }">
        ${escapeHTML(c.status || "Submitted")}
    </span>

    ${
        c.status === "Reopened"
            ? `<small style="display:block; margin-top:5px;">
                ⚠️ Citizen Disputed
               </small>`
            : ""
    }
</td>
                       

                        <td>
                            ${c.deadline
                                ? formatDate(c.deadline)
                                : "-"
                            }
                        </td>

                        <td>

                            <button
                                class="small-btn"
                                onclick="openAdminComplaint('${c.id}')">
                                Manage
                            </button>

                        </td>

                    </tr>
                `;
            })
            .join("");
}

/* =========================================================
   ADMIN COMPLAINT MANAGEMENT
========================================================= */

async function openAdminComplaint(id) {

    const c =
        adminComplaints.find(
            item => item.id === id
        );

    if (!c) return;

    const newStatus =
        prompt(
            `Complaint ${c.id}\n\nCurrent status: ${c.status}\n\nEnter new status:\nSubmitted\nAssigned\nIn Progress\nOn Hold\nResolved\nRejected\nReopened`,
            c.status
        );

    if (!newStatus) return;

    const allowed = [
        "Submitted",
        "Assigned",
        "In Progress",
        "On Hold",
        "Resolved",
        "Rejected",
        "Reopened"
    ];

    if (!allowed.includes(newStatus)) {

        showToast(
            "Invalid status."
        );

        return;
    }

    const officer =
        prompt(
            "Assigned officer name:",
            c.assigned_officer ||
            "Pending Assignment"
        );

    const note =
        prompt(
            "Resolution / action note:",
            c.resolution_note || ""
        );

    try {

        const formData =
            new FormData();

        formData.append(
            "status",
            newStatus
        );

        formData.append(
            "assignedOfficer",
            officer || ""
        );

        formData.append(
            "resolutionNote",
            note || ""
        );

        await apiRequest(
            `/complaints/${encodeURIComponent(id)}/status`,
            {
                method: "PATCH",
                body: formData
            }
        );

        showToast(
            "Complaint updated successfully."
        );

        loadAdminDashboard();

    } catch (error) {

        showToast(
            error.message
        );
    }
}

/* =========================================================
   CHART
========================================================= */

function renderCategoryChart(categories) {

    const canvas =
        $("categoryChart");

    if (!canvas) return;

    if (categoryChart) {
        categoryChart.destroy();
    }

    const labels =
        categories.map(
            item => item.category
        );

    const values =
        categories.map(
            item => item.count
        );

    categoryChart =
        new Chart(
            canvas.getContext("2d"),
            {
                type: "bar",

                data: {
                    labels,
                    datasets: [
                        {
                            label:
                                "Complaints",
                            data: values
                        }
                    ]
                },

                options: {
                    responsive: true,

                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            }
        );
}

/* =========================================================
   ADMIN MAP
========================================================= */

function initAdminMap() {

    const mapElement =
        $("adminMap");

    if (!mapElement) return;

    if (adminMap) {

        setTimeout(() => {
            adminMap.invalidateSize();
        }, 300);

        return;
    }

    adminMap =
        L.map(
            "adminMap"
        ).setView(
            [28.6139, 77.2090],
            11
        );

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution:
                "&copy; OpenStreetMap contributors"
        }
    ).addTo(adminMap);
}

async function loadAdminMap() {

    try {

        const complaints =
            await apiRequest(
                "/map"
            );

        initAdminMap();

        if (!adminMap) return;

        complaints.forEach(c => {

            if (
                c.latitude === null ||
                c.longitude === null
            ) {
                return;
            }

            const marker =
                L.marker([
                    Number(c.latitude),
                    Number(c.longitude)
                ]).addTo(
                    adminMap
                );

            marker.bindPopup(`
                <b>${escapeHTML(c.id)}</b>
                <br>
                ${escapeHTML(c.title)}
                <br>
                <b>Category:</b>
                ${escapeHTML(c.category)}
                <br>
                <b>Priority:</b>
                ${escapeHTML(c.priority)}
                <br>
                <b>Status:</b>
                ${escapeHTML(c.status)}
                <br>
                <b>Related:</b>
                ${escapeHTML(c.duplicate_count)}
            `);
        });

    } catch (error) {

        console.error(
            "Map loading failed:",
            error
        );
    }
}

/* =========================================================
   NGO DASHBOARD
========================================================= */

async function loadNGODashboard() {

    try {

        const complaints =
            await apiRequest(
                "/complaints"
            );

        renderNGOStats(
            complaints
        );

        renderNGOComplaints(
            complaints
        );

        if ($("ngoName") && currentUser) {
            $("ngoName").textContent =
                currentUser.name;
        }

    } catch (error) {

        showToast(
            error.message
        );
    }
}

function renderNGOStats(complaints) {

    const escalated =
        complaints.filter(
            c =>
                c.escalation_level &&
                c.escalation_level !== "Normal"
        );

    const citizens =
        new Set(
            complaints.map(
                c => c.user_id
            )
        );

    const areas =
        new Set(
            complaints.map(
                c => c.area_name
            )
        );

    const actions =
        complaints.filter(
            c => c.ngo_status
        );

    $("ngoEscalated").textContent =
        escalated.length;

    $("ngoCitizens").textContent =
        citizens.size;

    $("ngoAreas").textContent =
        areas.size;

    $("ngoActions").textContent =
        actions.length;
}
function renderNGOComplaints(complaints) {

    const container =
        $("ngoComplaintList");

    if (!container) return;

    const escalated =
        complaints.filter(
            c =>
                c.escalation_level &&
                c.escalation_level !==
                    "Normal"
        );

    if (!escalated.length) {

        container.innerHTML = `
            <div class="section-card">
                <h3>No escalated complaints.</h3>
                <p>
                    NGO action items will appear here.
                </p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        escalated
            .map(c => {

                return `
                    <div class="section-card ${
    c.escalation_level === "SLA Breached" ||
    c.escalation_level === "Emergency"
        ? "ngo-critical"
        : ""
}"
style="margin-bottom:15px;">

                        <h3>
                            🚨
                            ${escapeHTML(c.title)}
                        </h3>

                        <p>
                            <b>ID:</b>
                            ${escapeHTML(c.id)}
                        </p>

                        <p>
                            <b>Category:</b>
                            ${escapeHTML(c.category)}
                        </p>

                        <p>
                            <b>Area:</b>
                            ${escapeHTML(c.area_name)}
                        </p>

                        <p>
                            <b>Escalation:</b>
                            ${escapeHTML(c.escalation_level)}
                        </p>

                        <p>
                            ${escapeHTML(c.description)}
                        </p>
                        

                        ${
                            c.ngo_status
                                ? `
                                    <hr>

                                    <p>
                                        <b>🤝 NGO Status:</b>
                                        ${escapeHTML(c.ngo_status)}
                                    </p>

                                    <p>
                                        <b>📝 NGO Remarks:</b>
                                        ${escapeHTML(
                                            c.ngo_remarks || "-"
                                        )}
                                    </p>

                                    <p>
                                        <b>📅 Action Date:</b>
                                        ${c.ngo_action_date
                                            ? formatDate(
                                                c.ngo_action_date
                                            )
                                            : "-"
                                        }
                                    </p>

                                    ${
                                        c.ngo_evidence_url
                                            ? `
                                                <p>
                                                    <b>📎 Evidence:</b>
                                                    <a
                                                        href="${escapeHTML(
                                                            c.ngo_evidence_url
                                                        )}"
                                                        target="_blank">
                                                        View Evidence
                                                    </a>
                                                </p>
                                            `
                                            : ""
                                    }
                                `
                                : `
                                    <p>
                                        <b>🤝 NGO Status:</b>
                                        Action Pending
                                    </p>
                                `
                        }

                        <button
                            class="primary-btn"
                            onclick="ngoAction('${c.id}')">
                            🤝 Record NGO Action
                        </button>

                    </div>
                `;
            })
            .join("");
}

/* =========================================================
   NGO ACTION
========================================================= */

async function ngoAction(id) {

    const status =
        prompt(
            "NGO status:",
            "NGO Investigating"
        );

    if (!status) return;

    const remarks =
        prompt(
            "NGO remarks:"
        );

    if (remarks === null) return;

    try {

        const formData =
            new FormData();

        formData.append(
            "status",
            status
        );

        formData.append(
            "remarks",
            remarks
        );

        await apiRequest(
            `/complaints/${encodeURIComponent(id)}/ngo-action`,
            {
                method: "POST",
                body: formData
            }
        );

        showToast(
            "NGO action recorded."
        );

        loadNGODashboard();

    } catch (error) {

        showToast(
            error.message
        );
    }
}

/* =========================================================
   GLOBAL CLICK / ESCAPE
========================================================= */

document.addEventListener(
    "keydown",
    function(event) {

        if (event.key === "Escape") {

            closeCameraModal();
            closeDetailModal();
            closeComplaintModal();
        }
    }
);

/* =========================================================
   EXPORT FUNCTIONS FOR HTML onclick=""
========================================================= */

window.showLogin =
    showLogin;

window.showRegister =
    showRegister;

window.logout =
    logout;

window.openComplaintModal =
    openComplaintModal;

window.closeComplaintModal =
    closeComplaintModal;

window.openCameraModal =
    openCameraModal;

window.closeCameraModal =
    closeCameraModal;

window.switchCamera =
    switchCamera;

window.capturePhoto =
    capturePhoto;

window.removePhoto =
    removePhoto;

window.getCurrentLocation =
    getCurrentLocation;

window.closeDetailModal =
    closeDetailModal;

window.openComplaintDetail =
    openComplaintDetail;

window.reopenComplaint =
    reopenComplaint;

window.openAdminComplaint =
    openAdminComplaint;

window.ngoAction =
    ngoAction;
   /* =========================================================
   FORGOT PASSWORD
========================================================= */

function showForgotPassword() {

    showPage("forgotPasswordPage");

    const form = $("forgotPasswordForm");

    if (form) {
        form.reset();
    }

    $("otpSection")
        ?.classList
        .add("hidden");
}


async function sendForgotPasswordOTP() {

    const email =
        $("forgotEmail")
            .value
            .trim()
            .toLowerCase();

    if (!email) {

        showToast("Please enter your email.");

        return;
    }

    try {

        const data =
            await apiRequest(
                "/auth/forgot-password",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        email
                    })
                }
            );

        showToast(
            data.message ||
            "OTP generated successfully."
        );

        $("otpSection")
            ?.classList
            .remove("hidden");

    } catch (error) {

        console.error(error);

        showToast(
            error.message
        );
    }
}


/* =========================================================
   FORGOT PASSWORD FORM
========================================================= */

document.addEventListener(
    "submit",
    function (event) {

        if (
            event.target &&
            event.target.id ===
                "forgotPasswordForm"
        ) {

            event.preventDefault();

            sendForgotPasswordOTP();

        }

    }
);


/* Make function available to HTML */

window.showForgotPassword =
    showForgotPassword;
    /* =========================================================
VERIFY OTP
========================================================= */

async function verifyOTP() {

const email =
    $("forgotEmail")
        .value
        .trim()
        .toLowerCase();

const otp =
    $("resetOTP")
        .value
        .trim();

if (!email) {

    showToast(
        "Please enter your email."
    );

    return;
}

if (!/^\d{6}$/.test(otp)) {

    showToast(
        "OTP must be exactly 6 digits."
    );

    return;
}

try {

    const data =
        await apiRequest(
            "/auth/verify-otp",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    email,
                    otp
                })
            }
        );

    showToast(
        data.message ||
        "OTP verified successfully."
    );

    $("otpVerifyMessage").textContent =
        "✅ OTP verified successfully.";

    $("newPasswordSection")
        ?.classList
        .remove("hidden");

} catch (error) {

    console.error(
        "OTP verification error:",
        error
    );

    showToast(
        error.message ||
        "Invalid OTP."
    );

    $("otpVerifyMessage").textContent =
        "❌ " + (
            error.message ||
            "Invalid OTP."
        );
}

}
document.getElementById("resetOTP")?.addEventListener("input", function () {
    this.value = this.value.replace(/\D/g, "").slice(0, 6);
});

window.verifyOTP =
verifyOTP;
  /* =========================================================
   RESET PASSWORD
========================================================= */

async function resetPassword() {

    const email =
        $("forgotEmail")
            .value
            .trim()
            .toLowerCase();

    const otp =
        $("resetOTP")
            .value
            .trim();

    const newPassword =
        $("newPassword")
            .value;
const confirmPassword =
$("confirmPassword")
.value;
   if (
    !email ||
    !otp ||
    !newPassword ||
    !confirmPassword
) {

    showToast(
        "Please fill all fields."
    );

    return;
}

    if (!/^\d{6}$/.test(otp)) {

        showToast(
            "OTP must be 6 digits."
        );

        return;
    }

    if (newPassword.length < 6) {

        showToast(
            "Password must be at least 6 characters."
        );

        return;
    }
if (newPassword !== confirmPassword) {

showToast(
    "New password and confirm password do not match."
);

return;

}
    try {

        const data =
            await apiRequest(
                "/auth/reset-password",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        email,
                        otp,
                        newPassword
                    })
                }
            );

        showToast(
            data.message ||
            "Password reset successfully."
        );

        $("forgotPasswordForm")?.reset();

        $("otpSection")
            ?.classList
            .add("hidden");

        setTimeout(
            () => {
                showLogin();
            },
            1000
        );

    } catch (error) {

        console.error(
            "Reset password error:",
            error
        );

        showToast(
            error.message ||
            "Unable to reset password."
        );
    }
}

window.resetPassword =
    resetPassword;   
window.sendRegistrationOTP =
    sendRegistrationOTP;

window.verifyRegistrationOTP =
    verifyRegistrationOTP;

window.registerUser =
    registerUser;
  /* =========================================================
   LANGUAGE CHANGER
========================================================= */

function changeLanguage() {

    const selector =
        document.getElementById("languageSelector");

    if (!selector) return;

    const language = selector.value;

    const translations = {

        en: {
            welcome: "Welcome Back 👋",
            loginText: "Login to SmartCivic",
            email: "Email",
            password: "Password",
            login: "🔐 Login",
            forgot: "🔑 Forgot Password?",
            create: "➕ Create Citizen Account"
        },

        hi: {
            welcome: "वापसी पर स्वागत है 👋",
            loginText: "SmartCivic में लॉगिन करें",
            email: "ईमेल",
            password: "पासवर्ड",
            login: "🔐 लॉगिन",
            forgot: "🔑 पासवर्ड भूल गए?",
            create: "➕ नागरिक खाता बनाएँ"
        }

    };

    const t = translations[language];

    if (!t) return;

    const authCard = document.querySelector(
        "#loginPage .auth-card"
    );

    if (!authCard) return;

    const heading =
        authCard.querySelector("h2");

    if (heading) {
        heading.textContent = t.welcome;
    }

    const muted =
        authCard.querySelector(".muted");

    if (muted) {
        muted.textContent = t.loginText;
    }

    const labels =
        authCard.querySelectorAll("label");

    if (labels[0]) {
        labels[0].textContent = t.email;
    }

    if (labels[1]) {
        labels[1].textContent = t.password;
    }

    const loginButton =
        document.querySelector(
            "#loginForm button[type='submit']"
        );

    if (loginButton) {
        loginButton.textContent = t.login;
    }

    const buttons =
        authCard.querySelectorAll(
            ".secondary-btn"
        );

    if (buttons[0]) {
        buttons[0].textContent = t.forgot;
    }

    if (buttons[1]) {
        buttons[1].textContent = t.create;
    }
}
window.changeLanguage =
    changeLanguage;
    function toggleLanguageMenu() {

    const menu = document.getElementById("languageMenu");

    if (menu) {
        menu.classList.toggle("hidden");
    }
}

function selectLanguage(language) {

    const selector =
        document.getElementById("languageSelector");

    if (selector) {
        selector.value = language;

        if (typeof changeLanguage === "function") {
            changeLanguage();
        }
    }

    const menu =
        document.getElementById("languageMenu");

    if (menu) {
        menu.classList.add("hidden");
    }
}

window.toggleLanguageMenu = toggleLanguageMenu;
window.selectLanguage = selectLanguage;
/* =========================================================
   HOME BUTTON
========================================================= */

function goHome() {

    // Login/Home page दिखाएँ
    showLogin();

    // Page को ऊपर ले जाएँ
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}

window.goHome = goHome;
function toggleMenu() {
    const menu = document.getElementById("mainMenu");

    if (menu) {
        menu.classList.toggle("hidden");
    }
}

document.addEventListener("click", function (event) {

    const menu = document.getElementById("mainMenu");

    if (!menu) return;

    const menuButton = event.target.closest(
        'button[onclick="toggleMenu()"]'
    );

    if (!menu.contains(event.target) && !menuButton) {
        menu.classList.add("hidden");
    }

});
function showHelp() {
    const menu = document.getElementById("mainMenu");

    if (menu) {
        menu.classList.add("hidden");
    }

    alert(
        "Help & Support\n\n" +
        "📧 Email: support@smartcivic.com\n" +
        "📞 Support: Available 24×7\n\n" +
        "For technical problems, please contact SmartCivic Support."
    );
}

/* =====================================================
   SMARTCIVIC ASSISTANT
===================================================== */

function showAssistant() {

    const menu = document.getElementById("mainMenu");

    if (menu) {
        menu.classList.add("hidden");
    }

    const assistant = document.getElementById("assistantModal");

    if (assistant) {
        assistant.classList.remove("hidden");
    }

    setTimeout(() => {
        document.getElementById("assistantInput")?.focus();
    }, 100);
}


function closeAssistant() {

    const assistant =
        document.getElementById("assistantModal");

    if (assistant) {
        assistant.classList.add("hidden");
    }
}


function sendAssistantMessage() {

    const input =
        document.getElementById("assistantInput");

    const messages =
        document.getElementById("assistantMessages");

    if (!input || !messages) return;

    const question =
        input.value.trim();

    if (!question) return;


    /* USER MESSAGE */

    const userMessage =
        document.createElement("div");

    userMessage.className =
        "assistant-message user";

    userMessage.textContent =
        question;

    messages.appendChild(userMessage);

    input.value = "";

    messages.scrollTop =
        messages.scrollHeight;


    /* BOT RESPONSE */

    setTimeout(() => {

        const answer =
            getAssistantResponse(question);

        const botMessage =
            document.createElement("div");

        botMessage.className =
            "assistant-message bot";

        botMessage.innerHTML =
            answer;

        messages.appendChild(botMessage);

        messages.scrollTop =
            messages.scrollHeight;

    }, 500);
}


function getAssistantResponse(question) {

    const q =
        question.toLowerCase();


    if (
        q.includes("complaint") ||
        q.includes("report") ||
        q.includes("शिकायत") ||
        q.includes("समस्या")
    ) {

        return `
        📝 <b>Complaint कैसे करें?</b><br><br>
        1. Citizen Dashboard खोलें।<br>
        2. 🚨 Report Problem पर click करें।<br>
        3. Problem category और description भरें।<br>
        4. 📷 Photo evidence upload करें।<br>
        5. 📍 GPS location capture करें।<br>
        6. Submit Complaint दबाएँ।
        `;
    }


    if (
        q.includes("emergency") ||
        q.includes("urgent") ||
        q.includes("आपात") ||
        q.includes("खतरा")
    ) {

        return `
        🚨 <b>Emergency Civic Issue</b><br><br>
        अगर समस्या immediate danger पैदा कर रही है,
        जैसे dangerous electric wire या major flooding,
        तो <b>Report Emergency</b> option का इस्तेमाल करें।
        `;
    }


    if (
        q.includes("location") ||
        q.includes("gps") ||
        q.includes("लोकेशन")
    ) {

        return `
        📍 <b>GPS Location</b><br><br>
        Complaint form में
        <b>Capture GPS Location</b> button दबाएँ।
        Browser location permission माँगेगा।
        Allow करने के बाद location complaint के साथ save होगी।
        `;
    }


    if (
        q.includes("photo") ||
        q.includes("image") ||
        q.includes("फोटो")
    ) {

        return `
        📷 <b>Photo Evidence</b><br><br>
        Complaint form में
        <b>Open Camera</b> या
        <b>Choose Photo</b> से problem की photo attach कर सकते हैं।
        `;
    }


    if (
        q.includes("status") ||
        q.includes("track") ||
        q.includes("स्टेटस") ||
        q.includes("स्थिति")
    ) {

        return `
        📊 <b>Complaint Status</b><br><br>
        Citizen Dashboard में
        <b>My Complaints</b> section खोलें।
        वहाँ complaint का current status,
        priority और SLA information देख सकते हैं।
        `;
    }


    if (
        q.includes("password") ||
        q.includes("पासवर्ड")
    ) {

        return `
        🔐 <b>Password Help</b><br><br>
        Login page पर
        <b>Forgot Password?</b> दबाएँ।
        Registered email डालकर OTP verify करें,
        फिर नया password set करें।
        `;
    }


    if (
        q.includes("hello") ||
        q.includes("hi") ||
        q.includes("hey") ||
        q.includes("नमस्ते")
    ) {

        return `
        👋 Hello! मैं <b>SmartCivic Assistant</b> हूँ।<br><br>
        आप मुझसे complaint, GPS, photo evidence,
        emergency या complaint status के बारे में पूछ सकते हैं।
        `;
    }


    return `
    🤖 मैं आपकी मदद कर सकता हूँ।<br><br>
    आप इनमें से कुछ पूछ सकते हैं:<br>
    📝 Complaint कैसे करें?<br>
    📍 GPS location कैसे दें?<br>
    📷 Photo कैसे upload करें?<br>
    🚨 Emergency complaint कैसे करें?<br>
    📊 Complaint status कैसे देखें?<br>
    🔐 Password कैसे reset करें?
    `;
}


window.showAssistant =
    showAssistant;

window.closeAssistant =
    closeAssistant;

window.sendAssistantMessage =
    sendAssistantMessage;
    function showAbout() {
    alert(
        "🏙️ About SmartCivic\n\n" +
        "SmartCivic is an AI-powered civic issue reporting platform.\n\n" +
        "📍 Report civic problems\n" +
        "📷 Upload photo evidence\n" +
        "🤖 AI-assisted verification\n" +
        "🚨 Emergency escalation\n" +
        "🗺️ Location-based complaints\n" +
        "🤝 NGO transparency\n\n" +
        "SmartCivic — Smarter Cities, Better Living."
    );
}

window.showAbout = showAbout;
function askAssistantSuggestion(question) {

    const input =
        document.getElementById("assistantInput");

    if (!input) return;

    input.value = question;

    sendAssistantMessage();
}

window.askAssistantSuggestion =
    askAssistantSuggestion;
    const assistantInput =
    document.getElementById("assistantInput");

if (assistantInput) {

    assistantInput.addEventListener("keydown", function(event) {

        if (event.key === "Enter") {

            event.preventDefault();

            sendAssistantMessage();
        }

    });

}
