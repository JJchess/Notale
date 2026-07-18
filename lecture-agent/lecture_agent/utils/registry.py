"""轻量注册表工厂（内部接缝，非跨层 port）。

用于"受限名字集 + 拼错立即报错"的轴——典型是各 block 生成器。别过度：只给真会换的轴用。
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Generic, TypeVar

T = TypeVar("T")


class Registry(Generic[T]):
    def __init__(self, name: str) -> None:
        self.name = name
        self._m: dict[str, T] = {}

    def register(self, key: str) -> Callable[[T], T]:
        def deco(fn: T) -> T:
            if key in self._m:
                raise KeyError(f"{key!r} already registered in {self.name}")
            self._m[key] = fn
            return fn

        return deco

    def get(self, key: str) -> T:
        if key not in self._m:
            raise KeyError(f"{key!r} not in {self.name}; have {sorted(self._m)}")
        return self._m[key]

    def keys(self) -> list[str]:
        return sorted(self._m)
