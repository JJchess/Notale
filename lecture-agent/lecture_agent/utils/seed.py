"""统一随机种子。生成器无训练循环，但采样/打乱/多视角规划仍需可复现。"""

from __future__ import annotations

import os
import random


def seed_everything(seed: int) -> None:
    os.environ["PYTHONHASHSEED"] = str(seed)
    random.seed(seed)
    try:
        import numpy as np  # type: ignore[import-not-found]

        np.random.seed(seed)
    except ImportError:
        pass
