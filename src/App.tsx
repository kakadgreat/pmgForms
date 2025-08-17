import React, { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import SignaturePad from "signature_pad";

/**
 * PMG Intake (POC)
 * - Mobile-first, step-by-step form flow modeled after pmginventory look/feel
 * - Captures core data once and fan-outs to generate separate PDFs for:
 *   1) Registration Form
 *   2) Health History Questionnaire
 *   3) Financial Policy & Consent to Treat
 *   4) Release of Confidential Information
 *   5) Acknowledgement of Receipt of Privacy Notice
 *   6) Patient Code of Conduct
 * - All PDF generation happens in-browser (no backend) to keep PHI local for a HIPAA-friendly POC
 * - Exports a ZIP with individual PDFs, ready to be attached in the EMR
 */

// ---------- Tiny design system ----------
const Header = ({ step, total }: { step: number; total: number }) => (
  <div className="flex items-center justify-between p-4 md:p-6 bg-white shadow-sm sticky top-0 z-10">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-2xl bg-emerald-100 grid place-items-center text-emerald-700 font-semibold">PMG</div>
      <div className="font-semibold text-lg md:text-xl">New Patient – Adult (POC)</div>
    </div>
    <div className="text-sm text-gray-500">Step {step} / {total}</div>
  </div>
);

const Card: React.FC<{ title?: string; children: React.ReactNode }>
  = ({ title, children }) => (
    <div className="bg-white rounded-2xl shadow p-4 md:p-6 space-y-3">
      {title && <h2 className="text-lg md:text-xl font-semibold">{title}</h2>}
      {children}
    </div>
);

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
);

const Field: React.FC<{
  label: string;
  type?: string;
  value: any;
  onChange: (v: any) => void;
  placeholder?: string;
}> = ({ label, type = "text", value, onChange, placeholder }) => (
  <label className="flex flex-col gap-1">
    <span className="text-sm text-gray-700">{label}</span>
    <input
      className="border rounded-xl px-3 py-2 outline-none focus:ring-2 ring-emerald-400"
      type={type}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange((e.target as HTMLInputElement).value)}
    />
  </label>
);

const SelectField: React.FC<{
  label: string;
  value: any;
  onChange: (v: any) => void;
  options: string[];
}> = ({ label, value, onChange, options }) => (
  <label className="flex flex-col gap-1">
    <span className="text-sm text-gray-700">{label}</span>
    <select
      className="border rounded-xl px-3 py-2 outline-none focus:ring-2 ring-emerald-400"
      value={value ?? ""}
      onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
    >
      <option value="">Select…</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  </label>
);

const TextArea: React.FC<{ label: string; value: any; onChange: (v: any) => void; rows?: number }>
  = ({ label, value, onChange, rows = 4 }) => (
  <label className="flex flex-col gap-1">
    <span className="text-sm text-gray-700">{label}</span>
    <textarea
      rows={rows}
      className="border rounded-xl px-3 py-2 outline-none focus:ring-2 ring-emerald-400"
      value={value ?? ""}
      onChange={(e) => onChange((e.target as HTMLTextAreaElement).value)}
    />
  </label>
);

// ---------- Data model ----------
const emptyData = {
  // Registration + demographics
  firstName: "",
  lastName: "",
  middle: "",
  suffix: "",
  dob: "",
  sex: "",
  maritalStatus: "",
  ssn: "",
  email: "",
  phoneCell: "",
  phoneHome: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  employer: "",
  employerPhone: "",
  preferredContact: "",
  race: "",
  ethnicity: "",
  language: "",
  // Insurance
  insuredPerson: "",
  insuredDob: "",
  primaryInsurance: "",
  memberId: "",
  groupNo: "",
  copay: "",
  relationshipToSubscriber: "",
  secondaryInsurance: "",
  // Emergency
  emergencyName: "",
  emergencyRelation: "",
  emergencyHome: "",
  emergencyWork: "",
  // Health History – condensed
  medicalProblems: "",
  surgeries: "",
  hospitalizations: "",
  medications: "",
  allergies: "",
  exerciseLevel: "",
  diet: "",
  alcohol: "",
  tobacco: "",
  drugs: "",
  mentalHealth: "",
  womensHealth: "",
  mensHealth: "",
  otherProblems: "",
  // Release of confidential information
  mayContact: {
    spouse: false,
    children: false,
    phones: { home: false, cell: false, work: false },
    other: "",
  },
  authorizedContacts: [{ name: "", relationship: "", phone: "" }],
  // Financial policy & consents
  initialPolicies: false,
  // HIPAA / Privacy notice acknowledgement
  ackPrivacy: false,
  // Code of Conduct
  ackCodeOfConduct: false,
  // Signature
  signatureDataUrl: "",
  signatureDate: "",
};

// ---------- Signature Pad ----------
function Signature({ value, onChange }: { value: string; onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const pad = new SignaturePad(canvasRef.current, { minWidth: 0.8, maxWidth: 2.2 });
    padRef.current = pad;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const c = canvasRef.current!;
      const rect = c.getBoundingClientRect();
      c.width = rect.width * ratio;
      c.height = rect.height * ratio;
      c.getContext("2d")!.scale(ratio, ratio);
      pad.clear();
      if (value) {
        const img = new Image();
        img.onload = () => {
          const ctx = c.getContext("2d")!;
          ctx.drawImage(img, 0, 0, c.width / ratio, c.height / ratio);
        };
        img.src = value;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <div className="space-y-2">
      <div className="rounded-xl border bg-gray-50">
        <canvas ref={canvasRef} className="w-full h-32 rounded-xl" />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="px-3 py-2 rounded-xl bg-emerald-600 text-white"
          onClick={() => onChange(padRef.current?.toDataURL("image/png") || "")}
        >Save signature</button>
        <button
          type="button"
          className="px-3 py-2 rounded-xl border"
          onClick={() => { padRef.current?.clear(); onChange(""); }}
        >Clear</button>
      </div>
    </div>
  );
}

// ---------- PDF helpers ----------
const line = (doc: jsPDF, y: number, label: string, value?: string) => {
  doc.setFontSize(11);
  doc.text(label, 14, y);
  if (value) doc.text(value, 100, y, { maxWidth: 95 });
};

function pdfHeader(doc: jsPDF, title: string) {
  doc.setFontSize(16);
  doc.text("Prestige Medical Group", 14, 18);
  doc.setFontSize(12);
  doc.text(title, 14, 26);
  doc.setDrawColor(200);
  doc.line(14, 28, 200, 28);
}

function buildRegistrationPDF(data: any) {
  const doc = new jsPDF();
  pdfHeader(doc, "Registration Form (POC)");
  let y = 36;
  line(doc, y, `Patient: ${data.lastName}, ${data.firstName} ${data.middle || ""}`); y += 8;
  line(doc, y, "DOB:", data.dob); y += 8;
  line(doc, y, "Sex:", data.sex); y += 8;
  line(doc, y, "Marital Status:", data.maritalStatus); y += 8;
  line(doc, y, "SSN:", data.ssn); y += 8;
  line(doc, y, "Email:", data.email); y += 8;
  line(doc, y, "Phones:", `${data.phoneCell || ""} (cell)  ${data.phoneHome || ""} (home)`); y += 8;
  line(doc, y, "Address:", `${data.address}, ${data.city}, ${data.state} ${data.zip}`); y += 8;
  line(doc, y, "Employer:", `${data.employer}  |  ${data.employerPhone}`); y += 12;

  doc.setFontSize(12); doc.text("Insurance", 14, y); y += 6;
  line(doc, y, "Person Responsible:", data.insuredPerson); y += 8;
  line(doc, y, "DOB:", data.insuredDob); y += 8;
  line(doc, y, "Primary Insurance:", data.primaryInsurance); y += 8;
  line(doc, y, "Member ID:", data.memberId); y += 8;
  line(doc, y, "Group #:", data.groupNo); y += 8;
  line(doc, y, "Co-pay:", data.copay ? `$${data.copay}` : ""); y += 12;

  doc.setFontSize(12); doc.text("Emergency Contact", 14, y); y += 6;
  line(doc, y, "Name:", data.emergencyName); y += 8;
  line(doc, y, "Relationship:", data.emergencyRelation); y += 8;
  line(doc, y, "Home/Work:", `${data.emergencyHome} / ${data.emergencyWork}`); y += 18;

  if (data.signatureDataUrl) {
    doc.addImage(data.signatureDataUrl, "PNG", 14, y, 60, 18);
    doc.text(`Signed: ${data.signatureDate || ""}`, 14, y + 24);
  } else {
    doc.text("Signature: __________________________  Date: ____________", 14, y);
  }

  return doc.output("arraybuffer");
}

function buildHealthHistoryPDF(data: any) {
  const doc = new jsPDF();
  pdfHeader(doc, "Health History Questionnaire (POC – condensed)");
  let y = 36;
  line(doc, y, `Patient: ${data.lastName}, ${data.firstName} ${data.middle || ""}`); y += 8;
  line(doc, y, "DOB:", data.dob); y += 12;

  doc.setFontSize(12); doc.text("Medical Problems (dx)", 14, y); y += 6;
  doc.setFontSize(11); doc.text(data.medicalProblems || "—", 14, y, { maxWidth: 180 }); y += 18;

  doc.setFontSize(12); doc.text("Surgeries", 14, y); y += 6;
  doc.setFontSize(11); doc.text(data.surgeries || "—", 14, y, { maxWidth: 180 }); y += 18;

  doc.setFontSize(12); doc.text("Hospitalizations", 14, y); y += 6;
  doc.setFontSize(11); doc.text(data.hospitalizations || "—", 14, y, { maxWidth: 180 }); y += 18;

  doc.setFontSize(12); doc.text("Medications", 14, y); y += 6;
  doc.setFontSize(11); doc.text(data.medications || "—", 14, y, { maxWidth: 180 }); y += 18;

  doc.setFontSize(12); doc.text("Allergies", 14, y); y += 6;
  doc.setFontSize(11); doc.text(data.allergies || "—", 14, y, { maxWidth: 180 }); y += 18;

  doc.setFontSize(12); doc.text("Lifestyle", 14, y); y += 6;
  doc.setFontSize(11);
  doc.text(`Exercise: ${data.exerciseLevel || "—"}`, 14, y); y += 6;
  doc.text(`Diet: ${data.diet || "—"}`, 14, y); y += 6;
  doc.text(`Alcohol: ${data.alcohol || "—"}`, 14, y); y += 6;
  doc.text(`Tobacco: ${data.tobacco || "—"}`, 14, y); y += 6;
  doc.text(`Drugs: ${data.drugs || "—"}`, 14, y); y += 12;

  if (data.sex === "Female" && data.womensHealth) {
    doc.setFontSize(12); doc.text("Women’s Health", 14, y); y += 6;
    doc.setFontSize(11); doc.text(data.womensHealth, 14, y, { maxWidth: 180 }); y += 18;
  }
  if (data.sex === "Male" && data.mensHealth) {
    doc.setFontSize(12); doc.text("Men’s Health", 14, y); y += 6;
    doc.setFontSize(11); doc.text(data.mensHealth, 14, y, { maxWidth: 180 }); y += 18;
  }

  doc.setFontSize(12); doc.text("Other Problems / Symptoms", 14, y); y += 6;
  doc.setFontSize(11); doc.text(data.otherProblems || "—", 14, y, { maxWidth: 180 }); y += 18;

  if (data.signatureDataUrl) {
    doc.addImage(data.signatureDataUrl, "PNG", 14, y, 60, 18);
    doc.text(`Signed: ${data.signatureDate || ""}`, 14, y + 24);
  } else {
    doc.text("Signature: __________________________  Date: ____________", 14, y);
  }

  return doc.output("arraybuffer");
}

function buildFinancialPolicyPDF(data: any) {
  const doc = new jsPDF();
  pdfHeader(doc, "Financial Policy & Consent to Treat (POC acknowledgment)");
  let y = 36;
  doc.setFontSize(11);
  const bullets = [
    "I agree to pay my portion (deductible, copay/coinsurance) and any non-covered services.",
    "I understand missed-appointment fees may apply and balances >30 days may accrue finance fees.",
    "I authorize release of medical information for payment and coordination of care.",
    "I authorize assignment of benefits to Prestige Primary Care for services rendered.",
  ];
  bullets.forEach((b) => { doc.text(`• ${b}`, 14, y, { maxWidth: 180 }); y += 8; });
  y += 6;
  if (data.initialPolicies) doc.text("Initialed: ✔", 14, y);
  else doc.text("Initials: ____________", 14, y);
  y += 16;

  if (data.signatureDataUrl) {
    doc.addImage(data.signatureDataUrl, "PNG", 14, y, 60, 18);
    doc.text(`Signed: ${data.signatureDate || ""}`, 14, y + 24);
  } else {
    doc.text("Signature: __________________________  Date: ____________", 14, y);
  }
  return doc.output("arraybuffer");
}

function buildReleaseInfoPDF(data: any) {
  const doc = new jsPDF();
  pdfHeader(doc, "Release of Confidential Information (POC)");
  let y = 36;
  line(doc, y, "May contact spouse:", data.mayContact.spouse ? "Yes" : "No"); y += 8;
  line(doc, y, "May contact children:", data.mayContact.children ? "Yes" : "No"); y += 8;
  line(doc, y, "Voicemail permissions:", [
    data.mayContact.phones.home ? "Home" : null,
    data.mayContact.phones.cell ? "Cell" : null,
    data.mayContact.phones.work ? "Work" : null,
  ].filter(Boolean).join(", ") || "—"); y += 8;
  line(doc, y, "Other contact:", data.mayContact.other || "—"); y += 12;

  doc.setFontSize(12); doc.text("Authorized people to receive records/billing", 14, y); y += 6;
  doc.setFontSize(11);
  data.authorizedContacts.forEach((c: any, idx: number) => {
    doc.text(`${idx + 1}. ${c.name || "—"}  |  ${c.relationship || "—"}  |  ${c.phone || "—"}`, 14, y);
    y += 6;
  });
  y += 12;

  if (data.signatureDataUrl) {
    doc.addImage(data.signatureDataUrl, "PNG", 14, y, 60, 18);
    doc.text(`Signed: ${data.signatureDate || ""}`, 14, y + 24);
  } else {
    doc.text("Signature: __________________________  Date: ____________", 14, y);
  }
  return doc.output("arraybuffer");
}

function buildPrivacyAckPDF(data: any) {
  const doc = new jsPDF();
  pdfHeader(doc, "Acknowledgement of Receipt of Privacy Notice (POC)");
  let y = 36;
  const line1 = data.ackPrivacy
    ? "I acknowledge I received or had the opportunity to review the Notice of Privacy Practices."
    : "Acknowledgement pending (not checked).";
  doc.setFontSize(11);
  doc.text(line1, 14, y, { maxWidth: 180 });
  y += 18;
  if (data.signatureDataUrl) {
    doc.addImage(data.signatureDataUrl, "PNG", 14, y, 60, 18);
    doc.text(`Signed: ${data.signatureDate || ""}`, 14, y + 24);
  } else {
    doc.text("Signature: __________________________  Date: ____________", 14, y);
  }
  return doc.output("arraybuffer");
}

function buildCodeOfConductPDF(data: any) {
  const doc = new jsPDF();
  pdfHeader(doc, "Patient Code of Conduct (POC acknowledgment)");
  let y = 36;
  const items = [
    "Treat staff and patients with respect; no abusive, discriminatory, or threatening behavior.",
    "Follow clinic policies, instructions, and safety rules.",
    "Maintain privacy for yourself and others; no recording without consent.",
    "Financial responsibility: keep contact/insurance info current and pay balances promptly.",
  ];
  doc.setFontSize(11);
  items.forEach((t) => { doc.text(`• ${t}`, 14, y, { maxWidth: 180 }); y += 8; });
  y += 6;
  doc.text(`Acknowledged: ${data.ackCodeOfConduct ? "Yes" : "No"}`, 14, y);
  y += 16;
  if (data.signatureDataUrl) {
    doc.addImage(data.signatureDataUrl, "PNG", 14, y, 60, 18);
    doc.text(`Signed: ${data.signatureDate || ""}`, 14, y + 24);
  } else {
    doc.text("Signature: __________________________  Date: ____________", 14, y);
  }
  return doc.output("arraybuffer");
}

// ---------- Main component ----------
export default function App() {
  const [data, setData] = useState<any>(emptyData);
  const [step, setStep] = useState(1);
  const total = 6;

  const next = () => setStep((s) => Math.min(total, s + 1));
  const prev = () => setStep((s) => Math.max(1, s - 1));

  const update = (patch: Partial<typeof emptyData>) => setData((d: any) => ({ ...d, ...patch }));

  async function generateZip() {
    const zip = new JSZip();
    const ts = new Date().toISOString().slice(0, 10);

    const add = (name: string, bytes: ArrayBuffer) => zip.file(`${ts} - ${name}.pdf`, bytes as any);

    add("PMG Registration", buildRegistrationPDF(data));
    add("PMG Health History", buildHealthHistoryPDF(data));
    add("PMG Financial Policy & Consent", buildFinancialPolicyPDF(data));
    add("PMG Release of Confidential Information", buildReleaseInfoPDF(data));
    add("PMG Acknowledgement of Privacy Notice", buildPrivacyAckPDF(data));
    add("PMG Patient Code of Conduct", buildCodeOfConductPDF(data));

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `PMG_Intake_Packet_${ts}.zip`; a.click();
    URL.revokeObjectURL(url);
  }

  const StepNav = () => (
    <div className="flex items-center justify-between gap-3">
      <button className="px-4 py-2 rounded-xl border" onClick={prev} disabled={step === 1}>Back</button>
      {step < total ? (
        <button className="px-4 py-2 rounded-xl bg-emerald-600 text-white" onClick={next}>Continue</button>
      ) : (
        <button className="px-4 py-2 rounded-xl bg-emerald-600 text-white" onClick={generateZip}>Download PDFs (ZIP)</button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header step={step} total={total} />
      <motion.main className="max-w-3xl mx-auto p-4 md:p-6 space-y-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {step === 1 && (
          <Card title="About you">
            <Row>
              <Field label="First name" value={data.firstName} onChange={(v)=>update({firstName:v})} />
              <Field label="Last name" value={data.lastName} onChange={(v)=>update({lastName:v})} />
              <Field label="Middle" value={data.middle} onChange={(v)=>update({middle:v})} />
              <Field label="Suffix" value={data.suffix} onChange={(v)=>update({suffix:v})} />
              <Field label="Date of birth" type="date" value={data.dob} onChange={(v)=>update({dob:v})} />
              <SelectField label="Sex" value={data.sex} onChange={(v)=>update({sex:v})} options={["Male","Female","Other","Prefer not to say"]} />
              <SelectField label="Marital status" value={data.maritalStatus} onChange={(v)=>update({maritalStatus:v})} options={["Single","Partnered","Married","Separated","Divorced","Widowed"]} />
              <Field label="SSN (last 4 is ok)" value={data.ssn} onChange={(v)=>update({ssn:v})} />
              <Field label="Email" type="email" value={data.email} onChange={(v)=>update({email:v})} />
              <Field label="Cell phone" value={data.phoneCell} onChange={(v)=>update({phoneCell:v})} />
              <Field label="Home phone" value={data.phoneHome} onChange={(v)=>update({phoneHome:v})} />
              <Field label="Preferred contact method" value={data.preferredContact} onChange={(v)=>update({preferredContact:v})} />
              <Field label="Address" value={data.address} onChange={(v)=>update({address:v})} />
              <Field label="City" value={data.city} onChange={(v)=>update({city:v})} />
              <Field label="State" value={data.state} onChange={(v)=>update({state:v})} />
              <Field label="ZIP" value={data.zip} onChange={(v)=>update({zip:v})} />
              <Field label="Race" value={data.race} onChange={(v)=>update({race:v})} />
              <Field label="Ethnicity" value={data.ethnicity} onChange={(v)=>update({ethnicity:v})} />
              <Field label="Language" value={data.language} onChange={(v)=>update({language:v})} />
            </Row>
            <Row>
              <Field label="Employer" value={data.employer} onChange={(v)=>update({employer:v})} />
              <Field label="Employer phone" value={data.employerPhone} onChange={(v)=>update({employerPhone:v})} />
            </Row>
            <Row>
              <Field label="Emergency name" value={data.emergencyName} onChange={(v)=>update({emergencyName:v})} />
              <Field label="Emergency relationship" value={data.emergencyRelation} onChange={(v)=>update({emergencyRelation:v})} />
              <Field label="Emergency home phone" value={data.emergencyHome} onChange={(v)=>update({emergencyHome:v})} />
              <Field label="Emergency work phone" value={data.emergencyWork} onChange={(v)=>update({emergencyWork:v})} />
            </Row>
            <StepNav />
          </Card>
        )}

        {step === 2 && (
          <Card title="Insurance">
            <Row>
              <Field label="Person responsible for bill" value={data.insuredPerson} onChange={(v)=>update({insuredPerson:v})} />
              <Field label="Person’s DOB" type="date" value={data.insuredDob} onChange={(v)=>update({insuredDob:v})} />
              <Field label="Primary insurance" value={data.primaryInsurance} onChange={(v)=>update({primaryInsurance:v})} />
              <Field label="Member ID" value={data.memberId} onChange={(v)=>update({memberId:v})} />
              <Field label="Group #" value={data.groupNo} onChange={(v)=>update({groupNo:v})} />
              <Field label="Copay" value={data.copay} onChange={(v)=>update({copay:v})} />
              <Field label="Relationship to subscriber" value={data.relationshipToSubscriber} onChange={(v)=>update({relationshipToSubscriber:v})} />
              <Field label="Secondary insurance (if any)" value={data.secondaryInsurance} onChange={(v)=>update({secondaryInsurance:v})} />
            </Row>
            <StepNav />
          </Card>
        )}

        {step === 3 && (
          <Card title="Health history (condensed)">
            <TextArea label="Medical problems diagnosed by other doctors" value={data.medicalProblems} onChange={(v)=>update({medicalProblems:v})} />
            <TextArea label="Surgeries (year, reason, hospital)" value={data.surgeries} onChange={(v)=>update({surgeries:v})} />
            <TextArea label="Other hospitalizations" value={data.hospitalizations} onChange={(v)=>update({hospitalizations:v})} />
            <TextArea label="Current medications (name, strength, frequency)" value={data.medications} onChange={(v)=>update({medications:v})} />
            <TextArea label="Medication allergies (drug and reaction)" value={data.allergies} onChange={(v)=>update({allergies:v})} />

            <Row>
              <SelectField label="Exercise" value={data.exerciseLevel} onChange={(v)=>update({exerciseLevel:v})}
                options={["Sedentary","Mild","Occasional vigorous","Regular vigorous"]} />
              <Field label="Diet (notes)" value={data.diet} onChange={(v)=>update({diet:v})} />
              <Field label="Alcohol (type & drinks/week)" value={data.alcohol} onChange={(v)=>update({alcohol:v})} />
              <Field label="Tobacco (type & packs/day; years or quit year)" value={data.tobacco} onChange={(v)=>update({tobacco:v})} />
              <Field label="Drugs (recreational)" value={data.drugs} onChange={(v)=>update({drugs:v})} />
            </Row>

            <TextArea label="Mental health (depression, stress, sleep, counseling, etc.)" value={data.mentalHealth} onChange={(v)=>update({mentalHealth:v})} />
            <TextArea label="Women’s health (if applicable)" value={data.womensHealth} onChange={(v)=>update({womensHealth:v})} />
            <TextArea label="Men’s health (if applicable)" value={data.mensHealth} onChange={(v)=>update({mensHealth:v})} />
            <TextArea label="Other problems / symptoms" value={data.otherProblems} onChange={(v)=>update({otherProblems:v})} />
            <StepNav />
          </Card>
        )}

        {step === 4 && (
          <Card title="Privacy & Permissions">
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="flex items-center gap-2"><input type="checkbox" checked={data.mayContact.spouse} onChange={(e)=>update({ mayContact: { ...data.mayContact, spouse: (e.target as HTMLInputElement).checked } })} /> <span>May contact spouse</span></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={data.mayContact.children} onChange={(e)=>update({ mayContact: { ...data.mayContact, children: (e.target as HTMLInputElement).checked } })} /> <span>May contact children</span></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={data.mayContact.phones.home} onChange={(e)=>update({ mayContact: { ...data.mayContact, phones: { ...data.mayContact.phones, home: (e.target as HTMLInputElement).checked } } })} /> <span>Voicemail: Home</span></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={data.mayContact.phones.cell} onChange={(e)=>update({ mayContact: { ...data.mayContact, phones: { ...data.mayContact.phones, cell: (e.target as HTMLInputElement).checked } } })} /> <span>Voicemail: Cell</span></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={data.mayContact.phones.work} onChange={(e)=>update({ mayContact: { ...data.mayContact, phones: { ...data.mayContact.phones, work: (e.target as HTMLInputElement).checked } } })} /> <span>Voicemail: Work</span></label>
              </div>
              <Field label="Other option / person (name)" value={data.mayContact.other} onChange={(v)=>update({ mayContact: { ...data.mayContact, other: v } })} />

              <Card title="Authorized people (can receive records/billing)">
                {data.authorizedContacts.map((c: any, i: number) => (
                  <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                    <Field label="Name" value={c.name} onChange={(v)=>{
                      const ac = [...data.authorizedContacts]; ac[i] = { ...ac[i], name: v }; update({ authorizedContacts: ac });
                    }} />
                    <Field label="Relationship" value={c.relationship} onChange={(v)=>{
                      const ac = [...data.authorizedContacts]; ac[i] = { ...ac[i], relationship: v }; update({ authorizedContacts: ac });
                    }} />
                    <Field label="Phone" value={c.phone} onChange={(v)=>{
                      const ac = [...data.authorizedContacts]; ac[i] = { ...ac[i], phone: v }; update({ authorizedContacts: ac });
                    }} />
                  </div>
                ))}
                <div className="flex gap-2">
                  <button type="button" className="px-3 py-2 rounded-xl border" onClick={()=>update({ authorizedContacts: [...data.authorizedContacts, { name: "", relationship: "", phone: "" }] })}>Add person</button>
                  {data.authorizedContacts.length > 1 && (
                    <button type="button" className="px-3 py-2 rounded-xl border" onClick={()=>update({ authorizedContacts: data.authorizedContacts.slice(0,-1) })}>Remove last</button>
                  )}
                </div>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center gap-2"><input type="checkbox" checked={data.initialPolicies} onChange={(e)=>update({ initialPolicies: (e.target as HTMLInputElement).checked })} /> <span>I have read and initialed the Financial Policy summary</span></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={data.ackPrivacy} onChange={(e)=>update({ ackPrivacy: (e.target as HTMLInputElement).checked })} /> <span>I acknowledge receipt of Privacy Notice</span></label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={data.ackCodeOfConduct} onChange={(e)=>update({ ackCodeOfConduct: (e.target as HTMLInputElement).checked })} /> <span>I agree to the Patient Code of Conduct</span></label>
              </div>
            </div>
            <StepNav />
          </Card>
        )}

        {step === 5 && (
          <Card title="Signature">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Signature date" type="date" value={data.signatureDate} onChange={(v)=>update({ signatureDate: v })} />
            </div>
            <Signature value={data.signatureDataUrl} onChange={(url)=>update({ signatureDataUrl: url })} />
            <StepNav />
          </Card>
        )}

        {step === 6 && (
          <Card title="Finish & download">
            <p className="text-gray-700">Tap the button below to generate a ZIP containing separate PDFs for each form. Attach those PDFs in your EMR.</p>
            <div className="pt-3">
              <button className="px-4 py-2 rounded-xl bg-emerald-600 text-white" onClick={generateZip}>Download PDFs (ZIP)</button>
            </div>
            <div className="text-xs text-gray-500 pt-3">No data leaves your browser in this POC.</div>
          </Card>
        )}
      </motion.main>
    </div>
  );
}
