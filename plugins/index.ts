import { Plugin } from '@/types/plugin';
import p_0 from '@plugins/english/projectgutenberg';
import p_1 from '@plugins/english/standardebooks';
import p_2 from '@plugins/japanese/aozorabunko';
import p_3 from '@plugins/multi/komga';
import p_4 from '@plugins/multi/oapen';

const PLUGINS: Plugin.PluginBase[] = [p_0, p_1, p_2, p_3, p_4];
export default PLUGINS;
