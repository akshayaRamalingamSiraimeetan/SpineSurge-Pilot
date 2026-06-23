import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AuthSlice, createAuthSlice } from './authSlice';
import { PatientSlice, createPatientSlice } from './patientSlice';
import { CanvasSlice, createCanvasSlice } from './canvasSlice';
import { DicomSlice, createDicomSlice } from './dicomSlice';
import { ComparisonSlice, createComparisonSlice } from './comparisonSlice';
import { ShareSlice, createShareSlice } from './shareSlice';
import { LiveShareSlice, createLiveShareSlice } from './liveShareSlice';
import { Patient, Study, Scan, Visit, Context, ContextState, UserProfile, ThreeDImplant, DICOMResource, getStudyDisplayName, STUDY_STATUSES, StudyStatus } from './types';

export type AppState = AuthSlice & PatientSlice & CanvasSlice & DicomSlice & ComparisonSlice & ShareSlice & LiveShareSlice;

export const useAppStore = create<AppState>()(
    persist(
        (...a) => ({
            ...createAuthSlice(...a),
            ...createPatientSlice(...a),
            ...createCanvasSlice(...a),
            ...createDicomSlice(...a),
            ...createComparisonSlice(...a),
            ...createShareSlice(...a),
            ...createLiveShareSlice(...a),
        }),
        {
            name: 'spinesurge-auth',
            storage: createJSONStorage(() => localStorage),
            // Only persist the auth fields; everything else is session-only
            partialize: (state) => ({
                token:            state.token,
                isEmailVerified:  state.isEmailVerified,
                profileCompleted: state.profileCompleted,
                orgId:            state.orgId,
                activeWorkspace:  state.activeWorkspace,
            }),
        }
    )
);

export type { Patient, Study, Scan, Visit, Context, ContextState, UserProfile, ThreeDImplant, DICOMResource, StudyStatus };
export { getStudyDisplayName, STUDY_STATUSES };
