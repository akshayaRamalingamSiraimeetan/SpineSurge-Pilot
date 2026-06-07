"""Object storage (S3 / MinIO) for non-DICOM blobs: report PDFs and imported images.

Keys are namespaced per tenant (`org/{org_id}/...`) and access is via short-lived presigned URLs —
the browser never gets long-lived credentials. The boto3 client is created lazily so importing this
module never requires network access (presigned-URL generation is offline; only upload/delete hit
S3).
"""

from __future__ import annotations

import uuid
from functools import cached_property

import boto3
from botocore.config import Config

from app.core.config import settings


class StorageService:
    def _make_client(self, endpoint: str):  # noqa: ANN202
        return boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    @cached_property
    def _client(self):  # noqa: ANN202
        """Client for server-side operations (upload/delete) — uses the internal endpoint."""
        return self._make_client(settings.s3_endpoint)

    @cached_property
    def _presign_client(self):  # noqa: ANN202
        """Client whose host the BROWSER will hit — used only to sign GET URLs."""
        return self._make_client(settings.s3_public_endpoint or settings.s3_endpoint)

    @staticmethod
    def object_key(org_id: uuid.UUID, filename: str, *, prefix: str = "reports") -> str:
        safe = filename.replace("/", "_").replace("\\", "_")
        return f"org/{org_id}/{prefix}/{uuid.uuid4()}-{safe}"

    def upload_bytes(self, key: str, data: bytes, content_type: str) -> str:
        self._client.put_object(
            Bucket=settings.s3_bucket, Key=key, Body=data, ContentType=content_type
        )
        return key

    def presigned_get_url(self, key: str, *, expires: int = 900) -> str:
        return self._presign_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket, "Key": key},
            ExpiresIn=expires,
        )

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=settings.s3_bucket, Key=key)


storage = StorageService()
