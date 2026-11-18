import {
  ChapterBinaryMediaTypes,
  ChapterCaptureErrorCodes,
  ChapterCaptureLoadStrategies,
  ChapterContentTypes,
  NovelStatus,
  PluginInputTypes,
  PluginInstallModes,
  SourceAccessChallengeKinds,
  SourceAccessErrorCodes,
  WebViewInteractionTypes,
  isPluginInputType,
  isPluginInstallMode,
} from '../src/types/constants.ts';

export const FilterTypes = Object.freeze({
  TextInput: 'Text',
  Picker: 'Picker',
  CheckboxGroup: 'Checkbox',
  Switch: 'Switch',
  ExcludableCheckboxGroup: 'XCheckbox',
});

const FILTER_TYPE_VALUES = new Set(Object.values(FilterTypes));

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value) {
  return (
    Array.isArray(value) && value.every(entry => typeof entry === 'string')
  );
}

function isOptionsArray(value) {
  return (
    Array.isArray(value) &&
    value.every(
      entry =>
        isPlainRecord(entry) &&
        typeof entry.label === 'string' &&
        typeof entry.value === 'string',
    )
  );
}

function assertValidFilterEntry(key, entry, sourceLabel, pushError) {
  if (!isPlainRecord(entry)) {
    pushError(`${sourceLabel} filter '${key}' must be an object.`);
    return;
  }
  if (typeof entry.label !== 'string' || !entry.label.trim()) {
    pushError(`${sourceLabel} filter '${key}' must have a non-empty label.`);
  }
  if (typeof entry.type !== 'string' || !FILTER_TYPE_VALUES.has(entry.type)) {
    pushError(
      `${sourceLabel} filter '${key}' has unsupported type '${String(entry.type)}'.`,
    );
    return;
  }

  switch (entry.type) {
    case FilterTypes.Switch:
      if (typeof entry.value !== 'boolean') {
        pushError(
          `${sourceLabel} Switch filter '${key}' must have a boolean default value.`,
        );
      }
      break;
    case FilterTypes.TextInput:
      if (typeof entry.value !== 'string') {
        pushError(
          `${sourceLabel} Text filter '${key}' must have a string default value.`,
        );
      }
      break;
    case FilterTypes.Picker:
      if (typeof entry.value !== 'string') {
        pushError(
          `${sourceLabel} Picker filter '${key}' must have a string default value.`,
        );
      }
      if (!isOptionsArray(entry.options)) {
        pushError(
          `${sourceLabel} Picker filter '${key}' must have a valid options array.`,
        );
      }
      break;
    case FilterTypes.CheckboxGroup:
      if (!isStringArray(entry.value)) {
        pushError(
          `${sourceLabel} Checkbox filter '${key}' must have a string[] default value.`,
        );
      }
      if (!isOptionsArray(entry.options)) {
        pushError(
          `${sourceLabel} Checkbox filter '${key}' must have a valid options array.`,
        );
      }
      break;
    case FilterTypes.ExcludableCheckboxGroup:
      if (
        !isPlainRecord(entry.value) ||
        (entry.value.include !== undefined &&
          !isStringArray(entry.value.include)) ||
        (entry.value.exclude !== undefined &&
          !isStringArray(entry.value.exclude))
      ) {
        pushError(
          `${sourceLabel} XCheckbox filter '${key}' must have { include?, exclude? } default value.`,
        );
      }
      if (!isOptionsArray(entry.options)) {
        pushError(
          `${sourceLabel} XCheckbox filter '${key}' must have a valid options array.`,
        );
      }
      break;
  }
}

function assertValidInputSchema(schema, fieldName, sourceLabel, pushError) {
  if (schema === undefined) return;
  if (!isPlainRecord(schema)) {
    pushError(`${sourceLabel} ${fieldName} must be a plain object.`);
    return;
  }

  for (const [key, entry] of Object.entries(schema)) {
    if (!isPlainRecord(entry)) {
      pushError(`${sourceLabel} ${fieldName}.${key} must be an object.`);
      continue;
    }
    if (entry.type !== undefined && !isPluginInputType(entry.type)) {
      pushError(
        `${sourceLabel} ${fieldName}.${key} has unsupported type '${String(entry.type)}'.`,
      );
      continue;
    }
    if (entry.label !== undefined && typeof entry.label !== 'string') {
      pushError(`${sourceLabel} ${fieldName}.${key}.label must be a string.`);
    }
    if (
      entry.placeholder !== undefined &&
      typeof entry.placeholder !== 'string'
    ) {
      pushError(
        `${sourceLabel} ${fieldName}.${key}.placeholder must be a string.`,
      );
    }
    if (entry.required !== undefined && typeof entry.required !== 'boolean') {
      pushError(
        `${sourceLabel} ${fieldName}.${key}.required must be a boolean.`,
      );
    }
    if (entry.private !== undefined && typeof entry.private !== 'boolean') {
      pushError(
        `${sourceLabel} ${fieldName}.${key}.private must be a boolean.`,
      );
    }
    if (entry.options !== undefined && !isOptionsArray(entry.options)) {
      pushError(
        `${sourceLabel} ${fieldName}.${key}.options must be an array of { label, value }.`,
      );
    }

    if (entry.type === PluginInputTypes.Switch) {
      if (entry.value !== undefined && typeof entry.value !== 'boolean') {
        pushError(
          `${sourceLabel} Switch ${fieldName}.${key}.value must be a boolean.`,
        );
      }
      if (entry.options !== undefined) {
        pushError(
          `${sourceLabel} Switch ${fieldName}.${key} must not declare options.`,
        );
      }
    } else if (entry.type === PluginInputTypes.Select) {
      if (!isOptionsArray(entry.options) || entry.options.length === 0) {
        pushError(
          `${sourceLabel} Select ${fieldName}.${key} must declare non-empty options.`,
        );
      }
      if (entry.value !== undefined && typeof entry.value !== 'string') {
        pushError(
          `${sourceLabel} Select ${fieldName}.${key}.value must be a string.`,
        );
      }
    } else if (entry.value !== undefined && typeof entry.value !== 'string') {
      pushError(`${sourceLabel} ${fieldName}.${key}.value must be a string.`);
    }
  }
}

export function collectCompiledPluginContractErrors(instance, sourceLabel) {
  const errors = [];
  const pushError = message => errors.push(message);

  if (!isPlainRecord(instance)) {
    return [`${sourceLabel} must export a plugin object.`];
  }
  if (instance.apiVersion !== '0.2') {
    pushError(`${sourceLabel} must declare apiVersion '0.2'.`);
  }
  if (
    instance.installMode !== undefined &&
    !isPluginInstallMode(instance.installMode)
  ) {
    pushError(
      `${sourceLabel} has unsupported installMode '${String(instance.installMode)}'.`,
    );
  }
  if (instance.filters !== undefined) {
    if (!isPlainRecord(instance.filters)) {
      pushError(`${sourceLabel} filters must be a plain object.`);
    } else {
      for (const [key, entry] of Object.entries(instance.filters)) {
        assertValidFilterEntry(key, entry, sourceLabel, pushError);
      }
    }
  }
  assertValidInputSchema(
    instance.pluginInputs,
    'pluginInputs',
    sourceLabel,
    pushError,
  );
  assertValidInputSchema(
    instance.pluginSettings,
    'pluginSettings',
    sourceLabel,
    pushError,
  );

  return errors;
}

export function assertValidCompiledPluginContract(instance, sourceLabel) {
  const errors = collectCompiledPluginContractErrors(instance, sourceLabel);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
}

export function hasDisallowedInternalRequire(source) {
  return /require\(\s*["']@\//.test(source);
}

export function createHostModuleResolver(createFallback, customResolver) {
  const baseModules = {
    '@norea/host-capabilities': Object.freeze({
      sourceChapterNumberReconciliationVersion: 1,
    }),
    '@libs/novelStatus': { NovelStatus },
    '@libs/filterInputs': { FilterTypes },
    '@libs/pluginInputs': {
      inputs: createFallback(),
      pluginInputs: createFallback(),
      PluginInputTypes,
      PluginInstallModes,
    },
    '@libs/webView': {
      webViewFetch: createFallback(),
      webViewLoad: createFallback(),
      webViewNavigate: createFallback(),
      ChapterBinaryMediaTypes,
      ChapterCaptureErrorCodes,
      ChapterCaptureLoadStrategies,
      ChapterContentTypes,
      SourceAccessChallengeKinds,
      SourceAccessErrorCodes,
      WebViewInteractionTypes,
    },
  };

  return moduleId => {
    const base = baseModules[moduleId];
    if (customResolver) {
      const custom = customResolver(moduleId);
      if (moduleId === '@norea/host-capabilities') {
        return custom;
      }
      if (base && isPlainRecord(custom)) {
        return { ...base, ...custom };
      }
      return custom;
    }
    return base ?? createFallback();
  };
}
