# Preferences Menu Implementation

## Summary

Added a comprehensive preferences menu system to the Music Notation Editor with a modal dialog for managing application settings.

## Features Implemented

### 1. **Preferences Dialog** (`src/js/preferences.js`)
A `PreferencesUI` class that provides:

#### Settings Available:
- **Show Developer Tabs**: Toggle visibility of the inspector panel (LilyPond, MusicXML, IR, etc.)
- **Default Notation System**: Choose default pitch notation (Western, Number, Sargam, Bhatkhande, Tabla)
- **Show Debug Info**: Display debug information in the editor

#### Dialog Features:
- Modal dialog with backdrop blur effect
- Escape key and outside-click to close
- "Reset to Defaults" button to restore default settings
- "Save" button to apply and persist preferences
- "Cancel" button to discard changes
- Clean, accessible form layout with labels and descriptions

#### Storage:
- Preferences stored in `localStorage` under key `musicEditorPreferences`
- JSON format for easy serialization
- Automatic persistence on save

### 2. **Menu Integration** (`src/js/ui.js`)
- Added "Preferences..." menu item to File menu (with separator)
- Added 'preferences' action handler in `executeMenuAction()`
- Added `openPreferences()` method to open the dialog
- UI component receives `preferencesUI` instance via constructor

### 3. **Application Initialization** (`src/js/main.js`)
- Imported `PreferencesUI` class
- Created `preferencesUI` instance in `MusicNotationApp`
- Passed to UI component
- Called `initialize()` during app startup to apply saved preferences
- Made accessible via `editor.preferencesUI`

## File Changes

### New Files:
- `src/js/preferences.js` - Complete PreferencesUI class (351 lines)

### Modified Files:
- `src/js/ui.js` - Added preferences menu item and handler
- `src/js/main.js` - Initialize PreferencesUI component

### No HTML Changes Needed
- The app uses ES6 modules, so `preferences.js` is automatically included via import

## Usage

### For End Users:
1. Click **File** menu
2. Select **Preferences...**
3. Configure:
   - Check/uncheck "Show Developer Tabs"
   - Select default notation system from dropdown
   - Check/uncheck "Show Debug Info"
4. Click **Save** to apply settings
   - Settings persist across sessions via localStorage
5. Or click **Reset to Defaults** to restore default settings
6. Click **Cancel** to discard changes without saving

### For Developers:
Access preferences programmatically:
```javascript
// Get a preference value
const showDevTabs = window.MusicNotationApp.app().preferencesUI.get('showDeveloperTabs');
const defaultSystem = window.MusicNotationApp.app().preferencesUI.get('defaultNotationSystem');
const showDebug = window.MusicNotationApp.app().preferencesUI.get('showDebugInfo');

// Listen for preference changes
document.addEventListener('preferencesChanged', (event) => {
  console.log('Preferences updated:', event.detail);
});
```

## Default Preferences
```javascript
{
  showDeveloperTabs: true,
  defaultNotationSystem: 'western',
  showDebugInfo: false
}
```

## Styling
- Uses UnoCSS utility classes (same as Export dialog)
- Backdrop blur effect with dark overlay
- Modal centered on screen
- Accessible form controls with focus states
- Hover states on buttons

## Implementation Details

### PreferencesUI Methods:

#### Public:
- `open()` - Open the preferences dialog
- `close()` - Close the dialog
- `get(key)` - Get a preference value
- `initialize()` - Initialize and apply saved preferences
- `applyPreferences()` - Apply current preferences to the app

#### Private:
- `loadPreferences()` - Load from localStorage
- `savePreferences()` - Save to localStorage
- `createModalElement()` - Create DOM structure
- `createCheckboxGroup()` - Create checkbox preference
- `createSelectGroup()` - Create dropdown preference
- `resetToDefaults()` - Reset to default values
- `handleSave()` - Save button handler
- `showNotification()` - Display notifications (console for now)

### Preference Applications:
1. **showDeveloperTabs**: Toggles `#tabs-panel` visibility
2. **defaultNotationSystem**: Can be used by document creation workflows
3. **showDebugInfo**: Sets `data-debug-info` attribute on document root (for CSS/JS targeting)

## Future Enhancements

Possible additions:
- Toast notification component (currently logs to console)
- More granular developer options (individual tab visibility)
- Keyboard shortcuts customization
- Theme/appearance settings
- MIDI input preferences
- Export format preferences
- Recently used settings history

## Testing

Build succeeded:
```
npm run build-js
✓ created dist/main.js in 2.5s
```

All components properly integrated and no build errors.
