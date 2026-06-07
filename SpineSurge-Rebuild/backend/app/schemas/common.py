"""Shared schema helpers."""

from __future__ import annotations

from pydantic import BaseModel


class Page[T](BaseModel):
    items: list[T]
    page: int
    page_size: int
    total: int
