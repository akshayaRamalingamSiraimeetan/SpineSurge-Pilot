"""Unit tests for server-side PDF report rendering (no infra)."""

from __future__ import annotations

from app.services.report_pdf import _fmt_result, render_report_pdf


def test_renders_valid_pdf_with_measurements() -> None:
    pdf = render_report_pdf(
        patient={"name": "Report Patient", "age": 52, "gender": "F", "dob": None,
                 "contact": "MRN-0042"},
        diagnosis="Adult Scoliosis",
        measurements=[
            {"tool_key": "cobb", "result": {"value": 42.7, "unit": "°"}},
            {"tool_key": "sva", "result": {"value": 31.2, "unit": "mm"}},
        ],
        title="Spine Assessment Report",
    )
    assert pdf.startswith(b"%PDF-")
    assert len(pdf) > 1000


def test_renders_with_no_measurements() -> None:
    pdf = render_report_pdf(
        patient={"name": "Empty", "age": None, "gender": "O", "dob": None, "contact": None},
        diagnosis=None,
        measurements=[],
    )
    assert pdf.startswith(b"%PDF-")


def test_fmt_result_handles_shapes() -> None:
    assert _fmt_result({"value": 42.666, "unit": "°"}) == "42.67 °"
    assert _fmt_result({"value": 10, "unit": "mm"}) == "10 mm"
    assert _fmt_result({"display": "Grade II"}) == "Grade II"
    assert _fmt_result(None) == "—"
    assert _fmt_result({}) == "—"
