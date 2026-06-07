import Dexie, { Table } from 'dexie';
import { Patient, Visit, Study, Scan, Context, ContextState } from './store/types';

export class SpineSurgeDB extends Dexie {
    patients!: Table<Patient>;
    visits!: Table<Visit>;
    studies!: Table<Study>;
    scans!: Table<Scan>;
    contexts!: Table<Context>;
    contextStates!: Table<ContextState>;

    constructor() {
        super('SpineSurgeDB');
        this.version(1).stores({
            patients: 'id, name, age, lastVisit, isArchived',
            visits: 'id, patientId, date', // Added patientId index for queries
            studies: 'id, patientId, visitId',
            scans: 'id, studyId', // Note: Scan inside Study usually, but good to have if needed
            contexts: 'id, patientId, visitId',
            contextStates: 'contextId' // One-to-one with contexts
        });
    }
}

export const db = new SpineSurgeDB();
