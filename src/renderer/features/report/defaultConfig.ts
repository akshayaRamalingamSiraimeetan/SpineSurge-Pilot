import { ReportConfig, ReportSectionConfig } from "@/lib/store/types";

export const DEFAULT_REPORT_SECTIONS: ReportSectionConfig[] = [
    {
        id: "patient_summary",
        type: "patient_summary",
        enabled: true,
        order: 0,
        title: "Patient Summary",
        description: "Demographics, diagnosis, and case overview",
    },
    {
        id: "notes",
        type: "notes",
        enabled: true,
        order: 1,
        title: "Clinical Notes",
        description: "Additional observations and surgical instructions",
    },
    {
        id: "images",
        type: "images",
        enabled: true,
        order: 2,
        title: "Planning Images",
        description: "Pre-operative and Post-operative visualizations",
    },
    {
        id: "measurement_table",
        type: "measurement_table",
        enabled: true,
        order: 3,
        title: "Measurement Data",
        description: "Detailed parameters and tool measurements",
    },
    {
        id: "surgical_plan",
        type: "surgical_plan",
        enabled: true,
        order: 4,
        title: "Surgical Planning",
        description: "Implant sizes, trajectories, and placement details",
    }
];

export const getDefaultReportConfig = (): ReportConfig => ({
    sections: [...DEFAULT_REPORT_SECTIONS]
});
