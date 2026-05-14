"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const contenttypefixture_1 = __importDefault(require("@plugins/dev/contenttypefixture"));
const projectgutenberg_1 = __importDefault(require("@plugins/english/projectgutenberg"));
const standardebooks_1 = __importDefault(require("@plugins/english/standardebooks"));
const aozorabunko_1 = __importDefault(require("@plugins/japanese/aozorabunko"));
const githubdocs_1 = __importDefault(require("@plugins/multi/githubdocs"));
const komga_1 = __importDefault(require("@plugins/multi/komga"));
const oapen_1 = __importDefault(require("@plugins/multi/oapen"));
const PLUGINS = [contenttypefixture_1.default, projectgutenberg_1.default, standardebooks_1.default, aozorabunko_1.default, githubdocs_1.default, komga_1.default, oapen_1.default];
exports.default = PLUGINS;
