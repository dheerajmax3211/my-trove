"""Model state: an in-memory map, mirrored to one JSON file per appliance when MODEL_DIR is set.

On start every readable file is loaded; an unreadable or outdated file is skipped (the appliance then reports
"untrained" and home-pulse trains it again). Without MODEL_DIR a restart forgets every model.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from pathlib import Path

from .model import ApplianceModel

LOG = logging.getLogger("ml_service.store")


class ModelStore:
    def __init__(self, directory: str | None):
        self._dir = Path(directory) if directory else None
        self._models: dict[uuid.UUID, ApplianceModel] = {}
        self._lock = threading.Lock()
        if self._dir:
            self._dir.mkdir(parents=True, exist_ok=True)
            self._load()

    @property
    def persistent(self) -> bool:
        return self._dir is not None

    def _load(self) -> None:
        for path in sorted(self._dir.glob("*.json")):
            try:
                key = uuid.UUID(path.stem)
                self._models[key] = ApplianceModel.from_dict(json.loads(path.read_text()))
            except (ValueError, KeyError, TypeError, OSError) as e:
                LOG.warning("skipping model file %s: %s", path.name, e)
        LOG.info("loaded %d model(s) from %s", len(self._models), self._dir)

    def get(self, appliance_id: uuid.UUID) -> ApplianceModel | None:
        with self._lock:
            return self._models.get(appliance_id)

    def put(self, appliance_id: uuid.UUID, model: ApplianceModel) -> None:
        with self._lock:
            self._models[appliance_id] = model
            if self._dir:
                # the file name is the canonical UUID string: nothing from the request reaches the path otherwise
                target = self._dir / f"{appliance_id}.json"
                tmp = self._dir / f"{appliance_id}.json.tmp"
                tmp.write_text(json.dumps(model.to_dict()))
                os.replace(tmp, target)

    def delete(self, appliance_id: uuid.UUID) -> bool:
        with self._lock:
            existed = self._models.pop(appliance_id, None) is not None
            if self._dir:
                (self._dir / f"{appliance_id}.json").unlink(missing_ok=True)
            return existed

    def __len__(self) -> int:
        with self._lock:
            return len(self._models)
