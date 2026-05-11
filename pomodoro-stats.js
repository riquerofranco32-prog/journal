/**
 * Aggregate metrics from stored Pomodoro sessions (local calendar / week).
 *
 * @typedef {{ subject: string, studyMinutes: number, sessionCount: number }} SubjectBreakdownRow
 *
 * @typedef {{
 *   studyMinutesToday: number,
 *   sessionsToday: number,
 *   studySessionsToday: number,
 *   bySubjectToday: SubjectBreakdownRow[],
 *   studyMinutesThisWeek: number
 * }} PomodoroStats
 */

(function (global) {
  "use strict";

  function localDayKey(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  /** Monday 00:00 local time of the week containing `d`. */
  function startOfWeekMonday(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var w = x.getDay();
    var diff = w === 0 ? -6 : 1 - w;
    x.setDate(x.getDate() + diff);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  /**
   * @param {unknown[]} sessions
   * @returns {Array<{ duration: number, type: string, subject?: string, timestamp: string }>}
   */
  function normalizeSessions(sessions) {
    if (!Array.isArray(sessions)) return [];
    return sessions.filter(function (s) {
      return (
        s &&
        typeof s.duration === "number" &&
        s.duration > 0 &&
        (s.type === "study" || s.type === "break") &&
        typeof s.timestamp === "string"
      );
    });
  }

  /**
   * @param {unknown[]} sessions
   * @param {Date} [now]
   * @returns {PomodoroStats}
   */
  function computePomodoroStats(sessions, now) {
    now = now || new Date();
    var todayKey = localDayKey(now);
    var weekStart = startOfWeekMonday(now);
    var weekEndEx = addDays(weekStart, 7);

    var studySecToday = 0;
    var sessionsToday = 0;
    var studySessionsToday = 0;
    var studySecWeek = 0;
    /** @type {Record<string, { studySec: number, count: number }>} */
    var subjectMap = {};

    normalizeSessions(sessions).forEach(function (s) {
      var t = new Date(s.timestamp);
      if (isNaN(t.getTime())) return;

      var dayKey = localDayKey(t);
      var inWeek = t.getTime() >= weekStart.getTime() && t.getTime() < weekEndEx.getTime();

      if (dayKey === todayKey) {
        sessionsToday++;
        if (s.type === "study") {
          studySessionsToday++;
          studySecToday += s.duration;
          var raw = typeof s.subject === "string" ? s.subject.trim() : "";
          var label = raw ? raw : "(Sin materia)";
          if (!subjectMap[label]) subjectMap[label] = { studySec: 0, count: 0 };
          subjectMap[label].studySec += s.duration;
          subjectMap[label].count++;
        }
      }

      if (inWeek && s.type === "study") {
        studySecWeek += s.duration;
      }
    });

    var bySubjectToday = Object.keys(subjectMap)
      .map(function (k) {
        return {
          subject: k,
          studyMinutes: Math.round(subjectMap[k].studySec / 60),
          sessionCount: subjectMap[k].count,
        };
      })
      .sort(function (a, b) {
        if (b.studyMinutes !== a.studyMinutes) return b.studyMinutes - a.studyMinutes;
        return b.sessionCount - a.sessionCount;
      });

    return {
      studyMinutesToday: Math.round(studySecToday / 60),
      sessionsToday: sessionsToday,
      studySessionsToday: studySessionsToday,
      bySubjectToday: bySubjectToday,
      studyMinutesThisWeek: Math.round(studySecWeek / 60),
    };
  }

  /**
   * Local calendar days (YYYY-MM-DD) that have at least one completed study session.
   * @param {unknown[]} sessions
   * @returns {Set<string>}
   */
  function studyDayKeys(sessions) {
    var keys = new Set();
    normalizeSessions(sessions).forEach(function (s) {
      if (s.type !== "study") return;
      var t = new Date(s.timestamp);
      if (isNaN(t.getTime())) return;
      keys.add(localDayKey(t));
    });
    return keys;
  }

  /**
   * @param {Set<string>} days
   * @param {Date} anchorMidnight local midnight of first day to count (inclusive)
   * @returns {number}
   */
  function countStreakBackFrom(days, anchorMidnight) {
    var streak = 0;
    var d = new Date(anchorMidnight.getFullYear(), anchorMidnight.getMonth(), anchorMidnight.getDate());
    while (days.has(localDayKey(d))) {
      streak++;
      d = addDays(d, -1);
    }
    return streak;
  }

  /**
   * @typedef {{ streak: number, status: 'active' | 'pending' | 'broken' }} StudyStreakState
   */

  /**
   * - `active`: ≥1 study today — streak counts consecutive days including today.
   * - `pending`: no study today, but yesterday qualifies — show streak ending yesterday + pending indicator in UI.
   * - `broken`: otherwise (display 0).
   *
   * @param {unknown[]} sessions
   * @param {Date} [now]
   * @returns {StudyStreakState}
   */
  function computeStudyStreakState(sessions, now) {
    now = now || new Date();
    var days = studyDayKeys(sessions);
    var today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var todayKey = localDayKey(today0);
    var yesterday0 = addDays(today0, -1);
    var yesterdayKey = localDayKey(yesterday0);

    if (days.has(todayKey)) {
      return { streak: countStreakBackFrom(days, today0), status: "active" };
    }
    if (days.has(yesterdayKey)) {
      var s = countStreakBackFrom(days, yesterday0);
      if (s >= 1) {
        return { streak: s, status: "pending" };
      }
    }
    return { streak: 0, status: "broken" };
  }

  /**
   * @param {unknown[]} sessions
   * @param {Date} [now]
   * @returns {number}
   */
  function computeStudyStreak(sessions, now) {
    return computeStudyStreakState(sessions, now).streak;
  }

  global.computePomodoroStats = computePomodoroStats;
  global.computeStudyStreak = computeStudyStreak;
  global.computeStudyStreakState = computeStudyStreakState;
})(typeof window !== "undefined" ? window : globalThis);
