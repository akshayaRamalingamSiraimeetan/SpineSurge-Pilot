import { beforeEach, describe, expect, it } from 'vitest';
import { usePlanningStore } from './planningStore';
import { makeScrew } from './screwTrajectory';

const reset = () => usePlanningStore.getState().clearPlan();

describe('planningStore', () => {
  beforeEach(reset);

  it('adds an implant and auto-selects it', () => {
    const { addImplant } = usePlanningStore.getState();
    addImplant(makeScrew('s1', [0, 0, 0], 'L4', 'L'));
    const s = usePlanningStore.getState();
    expect(s.implants).toHaveLength(1);
    expect(s.selectedImplantId).toBe('s1');
  });

  it('reconciles diameter+length against the level catalog on prop update', () => {
    const { addImplant, updateScrewProps } = usePlanningStore.getState();
    addImplant(makeScrew('s1', [0, 0, 0], 'L4', 'L'));
    updateScrewProps('s1', { diameter: 6.0, length: 999 }); // 999 → nearest of [40,45,50] = 50
    const screw = usePlanningStore.getState().implants[0];
    expect(screw.properties.diameter).toBe(6.0);
    expect(screw.properties.length).toBe(50);
  });

  it('clears selection when the selected implant is removed', () => {
    const { addImplant, removeImplant } = usePlanningStore.getState();
    addImplant(makeScrew('s1', [0, 0, 0], 'L4', 'L'));
    removeImplant('s1');
    const s = usePlanningStore.getState();
    expect(s.implants).toHaveLength(0);
    expect(s.selectedImplantId).toBeNull();
  });

  it('clamps the workflow step to 1..5', () => {
    const { setWorkflowStep } = usePlanningStore.getState();
    setWorkflowStep(9);
    expect(usePlanningStore.getState().workflowStep).toBe(5);
    setWorkflowStep(-3);
    expect(usePlanningStore.getState().workflowStep).toBe(1);
  });

  it('records per-side grading on a simulation', () => {
    const { addSimulation, setGrading } = usePlanningStore.getState();
    addSimulation({ id: 'sim1', label: 'L4', landmarks: {} });
    setGrading('sim1', 'left', 82);
    expect(usePlanningStore.getState().simulations[0].grading?.left).toBe(82);
  });

  it('clearPlan resets everything', () => {
    const { addImplant, clearPlan } = usePlanningStore.getState();
    addImplant(makeScrew('s1', [0, 0, 0], 'L4', 'L'));
    clearPlan();
    expect(usePlanningStore.getState().implants).toHaveLength(0);
    expect(usePlanningStore.getState().workflowStep).toBe(1);
  });
});
