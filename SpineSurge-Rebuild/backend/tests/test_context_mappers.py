"""Pure mapping tests for the context service (no database)."""

from __future__ import annotations

import uuid

from app.models import Implant, Measurement, PedicleSimulation, ThreeDImplant
from app.services import contexts as svc


def test_to_measurement_maps_camelcase() -> None:
    cols = svc._to_measurement(
        {
            "id": "x",
            "toolKey": "cobb",
            "fragmentId": "f1",
            "points": [{"x": 1, "y": 2}],
            "result": {"value": 12.3, "unit": "deg"},
            "measurement": {"note": "n"},
            "timestamp": 100,
        }
    )
    assert cols["tool_key"] == "cobb"
    assert cols["fragment_id"] == "f1"
    assert cols["meta"] == {"note": "n"}
    assert cols["result"]["unit"] == "deg"


def test_to_implant_and_three_d_and_pedicle() -> None:
    assert svc._to_implant({"type": "rod", "angle": 5})["type"] == "rod"
    assert svc._to_three_d({"simulationId": "s1"})["simulation_id"] == "s1"
    ped = svc._to_pedicle({"label": "L4", "suggestedScrew_L": {"diameter": 6}})
    assert ped["label"] == "L4"
    assert ped["suggested_screw_l"] == {"diameter": 6}


def test_coerce_uuid() -> None:
    u = uuid.uuid4()
    assert svc._coerce_uuid(str(u)) == u
    assert svc._coerce_uuid("") is None
    assert svc._coerce_uuid(None) is None
    assert svc._coerce_uuid("not-a-uuid") is None


def test_out_mappers_roundtrip_keys() -> None:
    cid = uuid.uuid4()
    m = Measurement(
        id=uuid.uuid4(), org_id=uuid.uuid4(), context_id=cid, tool_key="sva",
        fragment_id=None, points=[], result={"value": 1}, meta={"a": 1}, timestamp=9,
    )
    out = svc.measurement_out(m)
    assert out["toolKey"] == "sva"
    assert out["measurement"] == {"a": 1}

    i = Implant(
        id=uuid.uuid4(), org_id=uuid.uuid4(), context_id=cid, type="screw",
        position={"x": 1}, angle=2.0, properties={}, timestamp=1,
    )
    assert svc.implant_out(i)["type"] == "screw"

    t = ThreeDImplant(
        id=uuid.uuid4(), org_id=uuid.uuid4(), context_id=cid, type="rod",
        position=[1, 2, 3], direction=[0, 0, 1], properties={}, level="L3", side="L",
    )
    assert svc.three_d_out(t)["level"] == "L3"

    p = PedicleSimulation(
        id=uuid.uuid4(), org_id=uuid.uuid4(), context_id=cid, label="L5",
        landmarks={}, suggested_screw_l={"diameter": 6},
    )
    assert svc.pedicle_out(p)["suggestedScrew_L"] == {"diameter": 6}
