"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fetch_1 = require("@libs/fetch");
const pluginInputs_1 = require("@libs/pluginInputs");
const DEFAULT_BASE_URL = 'http://localhost:3000';
const FIXTURE_PATH = 'static/fixtures/content-types/';
const NOVEL_PATH = 'fixture/content-types';
const BASE_URL_INPUT = 'baseUrl';
function withoutTrailingSlash(value) {
    return value.replace(/\/+$/, '');
}
function configuredBaseUrl() {
    var _a;
    const value = (_a = pluginInputs_1.inputs.get(BASE_URL_INPUT)) === null || _a === void 0 ? void 0 : _a.trim();
    return withoutTrailingSlash(value || DEFAULT_BASE_URL);
}
function fixtureRootUrl() {
    return `${configuredBaseUrl()}/${FIXTURE_PATH}`;
}
class ContentTypeFixturePlugin {
    constructor() {
        this.id = 'dev-content-type-fixture';
        this.name = 'Dev Content Type Fixture';
        this.version = '0.1.0';
        this.icon = 'siteNotAvailable.png';
        this.pluginInputs = {
            [BASE_URL_INPUT]: {
                label: 'Fixture server base URL',
                value: DEFAULT_BASE_URL,
                placeholder: 'http://localhost:3000',
                required: true,
            },
        };
    }
    getBaseUrl() {
        return fixtureRootUrl();
    }
    popularNovels() {
        return __awaiter(this, void 0, void 0, function* () {
            return [this.fixtureNovel()];
        });
    }
    searchNovels() {
        return __awaiter(this, void 0, void 0, function* () {
            return [this.fixtureNovel()];
        });
    }
    parseNovel() {
        return __awaiter(this, void 0, void 0, function* () {
            const rootUrl = this.fixtureRootUrl();
            const chapters = {
                html: `${rootUrl}chapters/html/chapter-1.html`,
                text: `${rootUrl}chapters/text/chapter-1.txt`,
                pdf: `${rootUrl}chapters/pdf/chapter-1.pdf`,
            };
            return Object.assign(Object.assign({}, this.fixtureNovel()), { author: 'Norea fixture', status: 'Completed', summary: 'Local development fixture for HTML, plain text, and PDF chapter handling.', chapters: [
                    {
                        name: 'HTML chapter with relative images',
                        path: chapters.html,
                        chapterNumber: 1,
                        contentType: 'html',
                    },
                    {
                        name: 'Plain text chapter',
                        path: chapters.text,
                        chapterNumber: 2,
                        contentType: 'text',
                    },
                    {
                        name: 'PDF chapter fallback',
                        path: chapters.pdf,
                        chapterNumber: 3,
                        contentType: 'pdf',
                    },
                ] });
        });
    }
    parseNovelSince(novelPath) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.parseNovel(novelPath);
        });
    }
    parseChapter(chapterPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const rootUrl = this.fixtureRootUrl();
            if (chapterPath.endsWith('/chapters/pdf/chapter-1.pdf')) {
                return `<p>This fixture chapter is backed by a PDF file. <a href="${chapterPath}">Open the local PDF fixture</a>.</p>`;
            }
            const response = yield (0, fetch_1.fetchApi)(chapterPath, {
                contextUrl: rootUrl,
            });
            return response.text();
        });
    }
    resolveUrl(path) {
        return path;
    }
    fixtureNovel() {
        const rootUrl = this.fixtureRootUrl();
        return {
            name: 'Norea Content Type Fixture',
            path: NOVEL_PATH,
            cover: `${rootUrl}chapters/shared/cover.svg`,
        };
    }
    fixtureRootUrl() {
        return fixtureRootUrl();
    }
}
exports.default = new ContentTypeFixturePlugin();
