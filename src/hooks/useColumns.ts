'use client';

import { useEffect, useState } from 'react';

/**
 * 当前网格列数（与平台卡片网格的断点严格对应）。
 * 只用于键盘方向键导航：↑↓ 应该跨一行，而不是跨一个卡片。
 */
export function useColumns(): number {
  const [columns, setColumns] = useState(2);

  useEffect(() => {
    function compute(): number {
      const width = window.innerWidth;
      if (width >= 1280) return 4;
      if (width >= 1024) return 3;
      if (width >= 640) return 2;
      return 1;
    }

    function update() {
      setColumns(compute());
    }

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return columns;
}
