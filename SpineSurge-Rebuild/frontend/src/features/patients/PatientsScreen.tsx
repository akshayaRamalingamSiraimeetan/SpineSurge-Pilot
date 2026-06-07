/* Patients — secondary list column + detail pane (DESIGN.md §4.4), rendered inside the global icon
   rail. Reads load from GET /patients (paginated, searchable) and GET /patients/{id} (visits +
   studies + scan URLs). Writes are wired to the real API: create/edit patient, add a study with an
   image (S3 scan) or a DICOM series (Orthanc STOW), via the mutation hooks. All states (loading,
   empty, error) are first-class so an empty backend still looks intentional. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { DicomSlot } from '@/components/ImageSlot';
import { ApiError } from '@/lib/api/client';
import {
  useCreatePatient,
  useCreateStudy,
  usePatient,
  usePatients,
  useUpdatePatient,
  useUploadDicom,
  useUploadScan,
  type PatientUpdate,
} from '@/lib/api/hooks';
import type { Gender, Patient, PatientCreate, Study, Visit } from '@/lib/api/types';

function initialsOf(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/* ---------------- shared modal shell ---------------- */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ width: 440, maxWidth: '92vw', padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>
      {error instanceof ApiError ? error.message : 'Something went wrong. Is the API running?'}
    </div>
  );
}

/* ---------------- create / edit patient ---------------- */
function PatientFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Patient;
  onClose: () => void;
  onSaved: (p: Patient) => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [age, setAge] = useState(initial?.age != null ? String(initial.age) : '');
  const [gender, setGender] = useState<Gender>(initial?.gender ?? 'O');
  const [contact, setContact] = useState(initial?.contact ?? '');
  const [dob, setDob] = useState(initial?.dob ?? '');

  const create = useCreatePatient();
  const update = useUpdatePatient(initial?.id ?? '');
  const pending = create.isPending || update.isPending;
  const error = create.error || update.error;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const body: PatientCreate | PatientUpdate = {
      name: name.trim(),
      age: age ? Number(age) : undefined,
      gender,
      contact: contact || undefined,
      dob: dob || undefined,
    };
    if (isEdit) update.mutate(body, { onSuccess: (p) => { onSaved(p); onClose(); } });
    else create.mutate(body as PatientCreate, { onSuccess: (p) => { onSaved(p); onClose(); } });
  };

  return (
    <Modal title={isEdit ? 'Edit Patient' : 'New Patient'} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorNote error={error} />
        <Field label="Full name *">
          <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. John Anderson" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
          <Field label="Age">
            <input className="input" type="number" min={0} max={150} value={age} onChange={(e) => setAge(e.target.value)} />
          </Field>
          <Field label="Sex">
            <select className="input" value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </select>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
          <Field label="MRN">
            <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Medical record no." />
          </Field>
          <Field label="Date of birth">
            <input className="input" value={dob} onChange={(e) => setDob(e.target.value)} placeholder="YYYY-MM-DD" />
          </Field>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={pending || !name.trim()}>
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create patient'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------- add a study (image upload or DICOM STOW) ---------------- */
type ImportKind = 'image' | 'dicom';

function NewStudyModal({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const [kind, setKind] = useState<ImportKind>('image');
  const [modality, setModality] = useState('X-Ray');
  const [files, setFiles] = useState<File[]>([]);

  const createStudy = useCreateStudy();
  const uploadScan = useUploadScan();
  const uploadDicom = useUploadDicom();
  const pending = createStudy.isPending || uploadScan.isPending || uploadDicom.isPending;
  const error = createStudy.error || uploadScan.error || uploadDicom.error;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return;
    if (kind === 'dicom') {
      uploadDicom.mutate({ patientId, files }, { onSuccess: onClose });
      return;
    }
    // 2D image: create the study, then upload the image as its scan.
    const study = await createStudy.mutateAsync({ patient_id: patientId, modality, source: 'upload' });
    uploadScan.mutate(
      { studyId: study.id, file: files[0], patientId },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal title="Add Study" onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorNote error={error} />
        <Field label="Import source">
          <div style={{ display: 'flex', gap: 8 }}>
            {(['image', 'dicom'] as ImportKind[]).map((k) => (
              <button
                type="button"
                key={k}
                className={'btn btn-outline btn-sm' + (kind === k ? ' active' : '')}
                style={kind === k ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
                onClick={() => { setKind(k); setFiles([]); }}
              >
                {k === 'image' ? '2D image (JPEG/PNG)' : 'DICOM series'}
              </button>
            ))}
          </div>
        </Field>
        {kind === 'image' && (
          <Field label="Modality">
            <select className="input" value={modality} onChange={(e) => setModality(e.target.value)}>
              {['X-Ray', 'EOS', 'CT', 'MRI', 'Other'].map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
        )}
        <Field label={kind === 'image' ? 'X-ray image' : 'DICOM files (.dcm)'}>
          <input
            className="input"
            type="file"
            accept={kind === 'image' ? 'image/*' : '.dcm,application/dicom'}
            multiple={kind === 'dicom'}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          {files.length > 0 && (
            <span className="muted-3" style={{ fontSize: 12 }}>{files.length} file{files.length > 1 ? 's' : ''} selected</span>
          )}
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={pending || files.length === 0}>
            {pending ? 'Uploading…' : 'Add study'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PatientList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (p: Patient) => void;
}) {
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const q = useDebounced(search, 300);
  const { data, isLoading, isError, error } = usePatients({ q, page_size: 50 });
  const patients = data?.items ?? [];

  return (
    <div className="list-col">
      <div className="list-col-head">
        <div className="lch-top">
          <h2>
            Patients{' '}
            {data && (
              <span className="muted-3" style={{ fontSize: 14, fontWeight: 600 }}>
                {data.total}
              </span>
            )}
          </h2>
          <button className="btn btn-outline btn-sm" onClick={() => setShowNew(true)}>
            <Icon name="plus" size={15} /> New Patient
          </button>
        </div>
        <div className="search">
          <Icon name="search" />
          <input placeholder="Search patients…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="list-col-scroll">
        {isLoading && (
          <div className="state-block">
            <div className="spinner" />
            <div className="sb-sub">Loading patients…</div>
          </div>
        )}
        {isError && (
          <div className="state-block">
            <span className="sb-ico">
              <Icon name="warning" size={24} />
            </span>
            <div className="sb-title">Couldn't load patients</div>
            <div className="sb-sub">{error instanceof ApiError ? error.message : 'Is the API running on VITE_API_URL?'}</div>
          </div>
        )}
        {!isLoading && !isError && patients.length === 0 && (
          <div className="state-block">
            <span className="sb-ico">
              <Icon name="patients" size={24} />
            </span>
            <div className="sb-title">No patients yet</div>
            <div className="sb-sub">Create a patient or import a study to get started.</div>
          </div>
        )}
        {patients.map((p) => (
          <button key={p.id} className={'plist-row' + (p.id === selectedId ? ' active' : '')} onClick={() => onSelect(p)}>
            <span className="avatar-initials tone-accent" style={{ width: 40, height: 40, fontSize: 14 }}>
              {initialsOf(p.name)}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="pr-name" style={{ display: 'block' }}>
                {p.name}
              </span>
              <span className="pr-meta" style={{ display: 'block' }}>
                {p.age != null ? `${p.age} · ` : ''}
                {p.gender === 'M' ? 'Male' : p.gender === 'F' ? 'Female' : 'Other'}
                {p.contact ? ` · MRN ${p.contact}` : ''}
              </span>
            </span>
            {p.has_alert && <span className="pr-alert" />}
          </button>
        ))}
      </div>
      {showNew && <PatientFormModal onClose={() => setShowNew(false)} onSaved={onSelect} />}
    </div>
  );
}

function StudyCard({ study }: { study: Study }) {
  const navigate = useNavigate();
  const done = study.orthanc_study_uid != null || (study.scans?.length ?? 0) > 0;
  const thumb = study.scans?.find((s) => s.url)?.url ?? undefined;
  return (
    <div className="card tl-study">
      <DicomSlot
        caption=""
        tag={study.modality}
        src={thumb}
        style={{ width: 64, height: 64, borderRadius: 'var(--r-sm)', flex: 'none' }}
      />
      <div className="ts-info" style={{ flex: 1 }}>
        <span className="ts-name">{study.modality || 'Study'}</span>
        <span className="ts-meta">{study.acquisition_date || study.source}</span>
        <span className="status" style={{ fontSize: 12, marginTop: 4 }}>
          <span className={'dot ' + (done ? 'dot-green' : 'dot-red')} />
          {done ? 'Ready' : 'In Progress'}
        </span>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={() => navigate(`/workspace/${study.id}`)}>
            Open Workspace
          </button>
        </div>
      </div>
    </div>
  );
}

function Timeline({ visits, studies }: { visits: Visit[]; studies: Study[] }) {
  const byVisit = useMemo(() => {
    const map = new Map<string, Study[]>();
    for (const s of studies) {
      const key = s.visit_id ?? '_';
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [studies]);

  const unlinked = byVisit.get('_') ?? [];

  return (
    <div className="timeline">
      {visits.map((v, i) => {
        const vStudies = byVisit.get(v.id) ?? [];
        return (
          <div key={v.id} className={'tl-node' + (i === 0 ? ' open' : '')}>
            <div className="tl-date">{v.date}</div>
            <div className="tl-title">{v.diagnosis || `Visit ${v.visit_number}`}</div>
            <div className="tl-count">{vStudies.length ? `${vStudies.length} studies` : v.comments || 'No studies'}</div>
            {vStudies.length > 0 && (
              <div className="tl-studies">
                {vStudies.map((s) => (
                  <StudyCard key={s.id} study={s} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {unlinked.length > 0 && (
        <div className="tl-node open">
          <div className="tl-title">Unscheduled studies</div>
          <div className="tl-studies">
            {unlinked.map((s) => (
              <StudyCard key={s.id} study={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PatientDetailPane({ patient, onSelect }: { patient: Patient; onSelect: (p: Patient) => void }) {
  const { data, isLoading } = usePatient(patient.id);
  const [showStudy, setShowStudy] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const visits = data?.visits ?? [];
  const studies = data?.studies ?? [];
  const hasContent = visits.length > 0 || studies.length > 0;

  return (
    <div className="detail">
      <div className="detail-head">
        <span className="avatar-initials tone-accent" style={{ width: 56, height: 56, fontSize: 20 }}>
          {initialsOf(patient.name)}
        </span>
        <div style={{ flex: 1 }}>
          <div className="dh-name">{patient.name}</div>
          <div className="dh-meta">
            <span>{patient.age != null ? `${patient.age} yrs` : 'Age —'}</span>
            <span className="dot" style={{ background: 'var(--text-3)', width: 4, height: 4 }} />
            <span>{patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : 'Other'}</span>
            <span className="dot" style={{ background: 'var(--text-3)', width: 4, height: 4 }} />
            <span>MRN {patient.contact ?? '—'}</span>
            {patient.has_alert && <span className="badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>Alert</span>}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowEdit(true)}>
          <Icon name="edit" size={15} /> Patient Details
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => setShowStudy(true)}>
          <Icon name="plus" size={15} /> Add Study
        </button>
      </div>
      <div className="detail-body">
        {isLoading ? (
          <div className="state-block">
            <div className="spinner" />
          </div>
        ) : !hasContent ? (
          <div className="state-block">
            <span className="sb-ico">
              <Icon name="calendar" size={24} />
            </span>
            <div className="sb-title">No studies yet</div>
            <div className="sb-sub">Add a study to this patient to begin assessment and planning.</div>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 6 }} onClick={() => setShowStudy(true)}>
              <Icon name="plus" size={15} /> Add Study
            </button>
          </div>
        ) : (
          <Timeline visits={visits} studies={studies} />
        )}
      </div>
      {showStudy && <NewStudyModal patientId={patient.id} onClose={() => setShowStudy(false)} />}
      {showEdit && <PatientFormModal initial={patient} onClose={() => setShowEdit(false)} onSaved={onSelect} />}
    </div>
  );
}

export function PatientsScreen() {
  const [selected, setSelected] = useState<Patient | null>(null);

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <PatientList selectedId={selected?.id ?? null} onSelect={setSelected} />
      {selected ? (
        <PatientDetailPane patient={selected} onSelect={setSelected} />
      ) : (
        <div className="detail">
          <div className="state-block">
            <span className="sb-ico">
              <Icon name="patients" size={24} />
            </span>
            <div className="sb-title">Select a patient</div>
            <div className="sb-sub">Choose a patient from the list to view their visits and studies.</div>
          </div>
        </div>
      )}
    </div>
  );
}
