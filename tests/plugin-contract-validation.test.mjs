import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ChapterCaptureErrorCodes,
  ChapterCaptureLoadStrategies,
  ChapterContentTypes,
  NovelStatus,
  PluginInputTypes,
  PluginInstallModes,
  SourceAccessChallengeKinds,
  SourceAccessErrorCodes,
  WebViewInteractionTypes,
  isChapterCaptureErrorCode,
  isChapterContentType,
  isNovelStatus,
  isPluginInputType,
  isPluginInstallMode,
  isSourceAccessChallengeKind,
  isSourceAccessErrorCode,
  isWebViewInteractionType,
} from '../src/types/constants.ts';
import {
  FilterTypes,
  collectCompiledPluginContractErrors,
  hasDisallowedInternalRequire,
} from '../scripts/plugin-contract-validation.js';

test('canonical contract constants and guards cover all host contract values', () => {
  assert.deepEqual(Object.values(NovelStatus), [
    'Unknown',
    'Ongoing',
    'Completed',
    'Licensed',
    'Publishing Finished',
    'Cancelled',
    'On Hiatus',
  ]);
  assert.equal(isNovelStatus(NovelStatus.Ongoing), true);
  assert.equal(isNovelStatus('ongoing'), false);

  assert.equal(isPluginInstallMode(PluginInstallModes.Single), true);
  assert.equal(isPluginInstallMode(PluginInstallModes.MultiSource), true);
  assert.equal(isPluginInstallMode('multi'), false);

  for (const type of Object.values(PluginInputTypes)) {
    assert.equal(isPluginInputType(type), true);
  }
  assert.equal(isPluginInputType('Boolean'), false);

  assert.deepEqual(Object.values(ChapterContentTypes), [
    'html',
    'text',
    'pdf',
    'markdown',
    'epub',
  ]);
  assert.equal(isChapterContentType('epub'), true);

  assert.equal(
    isChapterCaptureErrorCode(ChapterCaptureErrorCodes.InteractionFailed),
    true,
  );
  assert.equal(
    isSourceAccessChallengeKind(SourceAccessChallengeKinds.Forbidden),
    true,
  );
  assert.equal(
    isSourceAccessErrorCode(SourceAccessErrorCodes.SourceAccessRequired),
    true,
  );
  assert.equal(isWebViewInteractionType(WebViewInteractionTypes.WaitFor), true);
  assert.equal(ChapterCaptureLoadStrategies.Selector, 'selector');
});

test('plugin contract validation rejects invalid installMode, filter, and input definitions', () => {
  const valid = {
    apiVersion: '0.2',
    installMode: PluginInstallModes.Single,
    filters: {
      sort: {
        type: FilterTypes.Picker,
        label: 'Sort',
        value: 'popular',
        options: [{ label: 'Popular', value: 'popular' }],
      },
      completed: {
        type: FilterTypes.Switch,
        label: 'Completed only',
        value: false,
      },
    },
    pluginInputs: {
      enabled: {
        type: PluginInputTypes.Switch,
        label: 'Enabled',
        value: false,
      },
      mode: {
        type: PluginInputTypes.Select,
        label: 'Mode',
        value: 'fast',
        options: [{ label: 'Fast', value: 'fast' }],
      },
    },
  };
  assert.deepEqual(
    collectCompiledPluginContractErrors(valid, 'valid-demo'),
    [],
  );

  const invalid = {
    apiVersion: '0.2',
    installMode: 'bad-mode',
    filters: {
      sort: { type: 'InvalidFilter', label: 'Sort', value: 'a' },
      flag: { type: FilterTypes.Switch, label: 'Flag', value: 'false' },
    },
    pluginInputs: {
      toggle: {
        type: PluginInputTypes.Switch,
        label: 'Toggle',
        value: 'false',
      },
      picker: { type: PluginInputTypes.Select, label: 'Picker', options: [] },
    },
  };
  const errors = collectCompiledPluginContractErrors(invalid, 'broken-demo');
  assert.equal(errors.length, 5);
  assert.equal(
    hasDisallowedInternalRequire("require('@/types/constants')"),
    true,
  );
  assert.equal(
    hasDisallowedInternalRequire("require('@libs/pluginInputs')"),
    false,
  );
});
