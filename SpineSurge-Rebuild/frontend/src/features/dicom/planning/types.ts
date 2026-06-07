/* 3D surgical-planning domain model (ported from the old repo's lib/store/types.ts).
 * These shapes are the contract between the pedicle wizard, the screw overlays, and the volume
 * viewer. Geometry math lives in features/measurements/planning/* (parity-locked); this file is
 * pure data. */
import type { Vec3 } from '@/features/measurements/planning/SurgicalGeometry';

export type RenderMode = 'volume' | 'segmentation';
export type SegmentationTool = 'threshold' | 'scissors';

export interface ScrewProperties {
  diameter: number;
  length: number;
  color: string;
  headDiameter?: number;
  /** inward tilt (deg) */
  medialAngle?: number;
  /** caudal tilt (deg) */
  caudalAngle?: number;
  /** insertion depth (mm) */
  depth?: number;
}

export interface ThreeDImplant {
  id: string;
  type: 'screw' | 'rod';
  position: Vec3;
  direction: Vec3;
  properties: ScrewProperties;
  level?: string;
  side?: 'L' | 'R';
  simulationId?: string;
}

export interface PedicleLandmark {
  id: string;
  type: 'VAP' | 'PIP_L' | 'PIP_R' | 'FIDUCIAL';
  worldPos: Vec3;
  label: string;
  viewOrientation?: 'AXIAL' | 'SAGITTAL' | 'CORONAL';
}

export interface PedicleSimulation {
  id: string;
  label: string;
  landmarks: {
    VAP?: PedicleLandmark;
    PIP_L?: PedicleLandmark;
    PIP_R?: PedicleLandmark;
    fiducials?: PedicleLandmark[];
  };
  grading?: { left?: number; right?: number };
}

/** Normalized [0,1] bounding box used to crop the volume to the levels of interest. */
export interface RoiCrop {
  x0: number; x1: number;
  y0: number; y1: number;
  z0: number; z1: number;
}

export const FULL_ROI: RoiCrop = { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 };
