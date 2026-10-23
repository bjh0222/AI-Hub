/**
 * 通过 `node --import ./scripts/register.mjs <目标脚本>` 注册解析钩子。
 * 必须在目标模块加载「之前」注册，否则静态 import 已经解析完了。
 */

import { register } from 'node:module';

register('./ts-loader.mjs', import.meta.url);
