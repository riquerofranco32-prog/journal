/**
 * Persist completed Pomodoro sessions to localStorage.
 *
 * @typedef {'study'|'break'} PomodoroSessionType
 *
 * @typedef {Object} PomodoroSessionRecord
 * @property {number} duration   Planned length of the session in seconds.
 * @property {PomodoroSessionType} type
 * @property {string} subject   Free text (e.g. course or topic).
 * @property {string} timestamp ISO 8601 end time.
 */

(function (global) {
  "use strict";

  var DEFAULT_KEY = "cali_pomodoro_sessions_v1";
  var DEFAULT_MAX = 800;

  /**
   * @param {Storage} [storage]
   * @param {string} key
   * @returns {PomodoroSessionRecord[]}
   */
  function readAll(storage, key) {
    try {
      var raw = storage.getItem(key);
      if (!raw) return [];
      var data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * @param {Storage} storage
   * @param {string} key
   * @param {PomodoroSessionRecord[]} list
   */
  function writeAll(storage, key, list) {
    try {
      storage.setItem(key, JSON.stringify(list));
    } catch (e) {
      console.warn("[pomodoro-sessions] could not write", e);
    }
  }

  /**
   * @param {object} [options]
   * @param {Storage} [options.storage]  default localStorage
   * @param {string} [options.storageKey]
   * @param {number} [options.maxEntries]  trim oldest when exceeded
   * @returns {{
   *   append: (partial: Partial<PomodoroSessionRecord> & Pick<PomodoroSessionRecord, 'duration'|'type'>) => PomodoroSessionRecord | null,
   *   getAll: () => PomodoroSessionRecord[],
   *   clear: () => void
   * }}
   */
  function createPomodoroSessionStore(options) {
    options = options || {};
    var storage = options.storage || global.localStorage;
    var key = options.storageKey || DEFAULT_KEY;
    var maxEntries = options.maxEntries != null ? options.maxEntries : DEFAULT_MAX;

    return {
      /**
       * @param {object} partial
       * @param {number} partial.duration
       * @param {PomodoroSessionType} partial.type
       * @param {string} [partial.subject]
       * @param {string} [partial.timestamp]
       * @returns {PomodoroSessionRecord|null}
       */
      append: function (partial) {
        if (!partial || typeof partial.duration !== "number" || partial.duration <= 0) {
          console.warn("[pomodoro-sessions] invalid duration");
          return null;
        }
        var t = partial.type;
        if (t !== "study" && t !== "break") {
          console.warn("[pomodoro-sessions] type must be 'study' or 'break'");
          return null;
        }
        /** @type {PomodoroSessionRecord} */
        var session = {
          duration: Math.round(partial.duration),
          type: t,
          subject: typeof partial.subject === "string" ? partial.subject.trim() : "",
          timestamp: partial.timestamp || new Date().toISOString(),
        };
        var list = readAll(storage, key);
        list.push(session);
        if (list.length > maxEntries) {
          list.splice(0, list.length - maxEntries);
        }
        writeAll(storage, key, list);
        return session;
      },

      getAll: function () {
        return readAll(storage, key).slice();
      },

      clear: function () {
        writeAll(storage, key, []);
      },
    };
  }

  global.createPomodoroSessionStore = createPomodoroSessionStore;
  global.POMODORO_SESSIONS_STORAGE_KEY = DEFAULT_KEY;
})(typeof window !== "undefined" ? window : globalThis);
