"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var contenttypefixture_1 = __importDefault(require("@plugins/dev/contenttypefixture"));
var projectgutenberg_1 = __importDefault(require("@plugins/english/projectgutenberg"));
var standardebooks_1 = __importDefault(require("@plugins/english/standardebooks"));
var aozorabunko_1 = __importDefault(require("@plugins/japanese/aozorabunko"));
var komga_1 = __importDefault(require("@plugins/multi/komga"));
var oapen_1 = __importDefault(require("@plugins/multi/oapen"));
var PLUGINS = [contenttypefixture_1.default, projectgutenberg_1.default, standardebooks_1.default, aozorabunko_1.default, komga_1.default, oapen_1.default];
exports.default = PLUGINS;
