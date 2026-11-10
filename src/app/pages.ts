import type { ComponentType } from 'react';
import {
  Bluetooth,
  LayoutDashboard,
  Moon,
  SlidersHorizontal,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { DayMode } from '../pages/DayMode';
import { DeviceSettings } from '../pages/DeviceSettings';
import { MotorSettings } from '../pages/MotorSettings';
import { NightMode } from '../pages/NightMode';
import { Overview } from '../pages/Overview';

export interface PageDefinition {
  /** 出現在網址 hash，例如 `#/night`。 */
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  component: ComponentType;
}

/** 新增頁面只需要在這裡加一筆；側邊欄與路由會自動跟上。 */
export const PAGES: readonly PageDefinition[] = [
  {
    id: 'overview',
    title: '控制總覽',
    subtitle: '掌握設備狀態與日夜運作節奏',
    icon: LayoutDashboard,
    component: Overview,
  },
  {
    id: 'day',
    title: '日間模式',
    subtitle: '設定每一次完整眨眼的節奏',
    icon: Sun,
    component: DayMode,
  },
  {
    id: 'night',
    title: '夜間模式',
    subtitle: '手動閉眼保持與自動日夜排程',
    icon: Moon,
    component: NightMode,
  },
  {
    id: 'motor',
    title: '馬達設定',
    subtitle: '調整左右側桌面模型的參考角度',
    icon: SlidersHorizontal,
    component: MotorSettings,
  },
  {
    id: 'device',
    title: '設備設定',
    subtitle: '選擇設備類型，管理連線、儲存與設備資訊',
    icon: Bluetooth,
    component: DeviceSettings,
  },
];

/** 找不到對應頁面（含空白 hash）時回到第一頁。 */
export function findPage(id: string): PageDefinition {
  return PAGES.find((page) => page.id === id) ?? PAGES[0];
}
