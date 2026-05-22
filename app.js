const GROQ_URL = 'https://api.groq.com/openai/v1';

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

let config = {
    apiKey: localStorage.getItem('groq_api_key') || '',
    email:  localStorage.getItem('doctor_email')  || ''
};

// Elements
const recordBtn        = document.getElementById('record-btn');
const recordLabel      = document.getElementById('record-label');
const recordingStatus  = document.getElementById('recording-status');
const transcriptSection = document.getElementById('transcript-section');
const transcriptEl     = document.getElementById('transcript');
const generateBtn      = document.getElementById('generate-btn');
const loadingEl        = document.getElementById('loading');
const loadingText      = document.getElementById('loading-text');
const reportSection    = document.getElementById('report-section');
const reportEl         = document.getElementById('report');
const copyBtn          = document.getElementById('copy-btn');
const emailBtn         = document.getElementById('email-btn');
const newBtn           = document.getElementById('new-btn');
const configBtn        = document.getElementById('config-btn');
const configModal      = document.getElementById('config-modal');
const apiKeyInput      = document.getElementById('api-key-input');
const emailInput       = document.getElementById('email-input');
const saveConfigBtn    = document.getElementById('save-config');

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
    if (!config.apiKey || !config.email) showConfigModal();

    recordBtn.addEventListener('click', toggleRecording);
    generateBtn.addEventListener('click', generateReport);
    copyBtn.addEventListener('click', copyReport);
    emailBtn.addEventListener('click', sendEmail);
    newBtn.addEventListener('click', resetApp);
    configBtn.addEventListener('click', showConfigModal);
    saveConfigBtn.addEventListener('click', saveConfig);
}

// ── Config ────────────────────────────────────────────────────────────────────

function showConfigModal() {
    apiKeyInput.value = config.apiKey;
    emailInput.value  = config.email;
    configModal.classList.remove('hidden');
}

function saveConfig() {
    const apiKey = apiKeyInput.value.trim();
    const email  = emailInput.value.trim();
    if (!apiKey || !email) { alert('Completa los dos campos.'); return; }
    config.apiKey = apiKey;
    config.email  = email;
    localStorage.setItem('groq_api_key', apiKey);
    localStorage.setItem('doctor_email',  email);
    configModal.classList.add('hidden');
}

// ── Recording ─────────────────────────────────────────────────────────────────

async function toggleRecording() {
    if (!config.apiKey) { showConfigModal(); return; }
    isRecording ? stopRecording() : await startRecording();
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Prefer webm, fall back to whatever the browser supports
        const mimeType = MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : '';

        audioChunks  = [];
        mediaRecorder = mimeType
            ? new MediaRecorder(stream, { mimeType })
            : new MediaRecorder(stream);

        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
            await transcribeAudio(blob);
        };

        mediaRecorder.start(500);
        isRecording = true;

        recordBtn.classList.add('recording');
        recordLabel.textContent = 'Detener';
        recordingStatus.classList.remove('hidden');

        hide(transcriptSection, reportSection);

    } catch (err) {
        alert('No se puede acceder al micrófono: ' + err.message);
    }
}

function stopRecording() {
    mediaRecorder?.stop();
    isRecording = false;
    recordBtn.classList.remove('recording');
    recordLabel.textContent = 'Pulsa para grabar';
    recordingStatus.classList.add('hidden');
    showLoading('Transcribiendo audio...');
}

// ── Groq Whisper ──────────────────────────────────────────────────────────────

async function transcribeAudio(blob) {
    try {
        const ext      = blob.type.includes('ogg') ? 'ogg'
                       : blob.type.includes('mp4') ? 'mp4'
                       : 'webm';
        const formData = new FormData();
        formData.append('file', blob, `audio.${ext}`);
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('language', 'es');
        formData.append('response_format', 'text');

        const res = await fetch(`${GROQ_URL}/audio/transcriptions`, {
            method:  'POST',
            headers: { Authorization: `Bearer ${config.apiKey}` },
            body:    formData
        });

        if (!res.ok) throw new Error(await res.text());

        const transcript = (await res.text()).trim();
        hideLoading();
        transcriptEl.textContent = transcript;
        transcriptSection.classList.remove('hidden');

    } catch (err) {
        hideLoading();
        alert('Error al transcribir: ' + err.message);
    }
}

// ── Groq LLaMA ────────────────────────────────────────────────────────────────

const REPORT_PROMPTS = {
    alta: `Genera un INFORME DE ALTA HOSPITALARIA estructurado para el servicio de Neumología.
Secciones (incluye solo las que tengan información):
INFORME DE ALTA HOSPITALARIA — NEUMOLOGÍA
MOTIVO DE INGRESO:
ANTECEDENTES PERSONALES DE INTERÉS:
EXPLORACIÓN AL INGRESO:
PRUEBAS COMPLEMENTARIAS:
DIAGNÓSTICO PRINCIPAL:
DIAGNÓSTICOS SECUNDARIOS:
TRATAMIENTO DURANTE EL INGRESO:
EVOLUCIÓN:
TRATAMIENTO AL ALTA:
RECOMENDACIONES Y SEGUIMIENTO:`,

    consulta: `Genera un INFORME DE CONSULTA/SEGUIMIENTO de Neumología.
Secciones:
INFORME DE CONSULTA — NEUMOLOGÍA
MOTIVO DE CONSULTA:
ANTECEDENTES DE INTERÉS:
EXPLORACIÓN FÍSICA:
PRUEBAS COMPLEMENTARIAS:
DIAGNÓSTICO:
PLAN TERAPÉUTICO:
PRÓXIMA CITA:`,

    interconsulta: `Genera una INTERCONSULTA de Neumología.
Secciones:
INTERCONSULTA — NEUMOLOGÍA
MÉDICO SOLICITANTE:
MOTIVO DE INTERCONSULTA:
ANTECEDENTES RELEVANTES:
SITUACIÓN CLÍNICA ACTUAL:
JUICIO DIAGNÓSTICO:
RECOMENDACIONES:`,

    urgencias: `Genera un INFORME DE URGENCIAS de Neumología.
Secciones:
INFORME DE URGENCIAS — NEUMOLOGÍA
MOTIVO DE CONSULTA:
ANTECEDENTES RELEVANTES:
EXPLORACIÓN:
PRUEBAS REALIZADAS:
DIAGNÓSTICO:
TRATAMIENTO:
EVOLUCIÓN:
DESTINO AL ALTA: [ingreso / domicilio / observación]
INSTRUCCIONES AL ALTA:`,

    inss: `Genera un INFORME MÉDICO PARA INCAPACIDAD LABORAL.
Secciones:
INFORME MÉDICO — INCAPACIDAD LABORAL
DIAGNÓSTICO PRINCIPAL:
DIAGNÓSTICOS SECUNDARIOS:
SITUACIÓN CLÍNICA:
TRATAMIENTO ACTUAL:
EVOLUCIÓN Y PRONÓSTICO:
LIMITACIONES FUNCIONALES:
VALORACIÓN MÉDICA:`
};

async function generateReport() {
    const transcript = transcriptEl.textContent.trim();
    if (!transcript) { alert('No hay texto para generar el informe.'); return; }

    const reportType = document.getElementById('report-type').value;
    transcriptSection.classList.add('hidden');
    showLoading('Generando informe...');

    const systemPrompt = `Eres un asistente médico especializado en neumología.
Genera informes médicos profesionales en español a partir de notas dictadas.
Usa terminología médica correcta. Responde ÚNICAMENTE con el informe, sin explicaciones.
${REPORT_PROMPTS[reportType] || REPORT_PROMPTS.consulta}`;

    try {
        const res = await fetch(`${GROQ_URL}/chat/completions`, {
            method:  'POST',
            headers: {
                Authorization:  `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model:       'llama-3.3-70b-versatile',
                temperature: 0.25,
                max_tokens:  2048,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user',   content: `Notas del médico:\n\n${transcript}` }
                ]
            })
        });

        if (!res.ok) throw new Error(JSON.stringify(await res.json()));

        const data   = await res.json();
        const report = data.choices[0].message.content;

        hideLoading();
        reportEl.textContent = report;
        reportSection.classList.remove('hidden');
        reportSection.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        hideLoading();
        transcriptSection.classList.remove('hidden');
        alert('Error al generar el informe: ' + err.message);
    }
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function copyReport() {
    await navigator.clipboard.writeText(reportEl.textContent);
    copyBtn.textContent = '✓ Copiado';
    setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 2000);
}

function sendEmail() {
    const typeLabels = {
        alta:           'Alta hospitalaria',
        consulta:       'Consulta/Seguimiento',
        interconsulta:  'Interconsulta',
        urgencias:      'Urgencias',
        inss:           'Incapacidad laboral'
    };
    const type    = document.getElementById('report-type').value;
    const subject = `Informe médico — ${typeLabels[type] || type}`;
    const body    = reportEl.textContent;
    window.location.href = `mailto:${config.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function resetApp() {
    hide(transcriptSection, reportSection, loadingEl);
    transcriptEl.textContent = '';
    reportEl.textContent     = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showLoading(msg) {
    loadingText.textContent = msg;
    loadingEl.classList.remove('hidden');
}

function hideLoading() {
    loadingEl.classList.add('hidden');
}

function hide(...els) {
    els.forEach(el => el.classList.add('hidden'));
}

init();
