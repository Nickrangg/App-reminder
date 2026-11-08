import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Pressable,
  ScrollView,
  SafeAreaView,
  TextInput,
  Modal,
  StatusBar,
  Keyboard,
  PanResponder,
  Alert,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const STORAGE_TASKS_KEY = '@reminder_quests_tasks_v4';
const STORAGE_CATS_KEY = '@reminder_quests_cats_v4';

const WEEK_DAYS = [
  { id: 1, short: 'Mon' },
  { id: 2, short: 'Tue' },
  { id: 3, short: 'Wed' },
  { id: 4, short: 'Thu' },
  { id: 5, short: 'Fri' },
  { id: 6, short: 'Sat' },
  { id: 0, short: 'Sun' },
];

const CATEGORY_COLORS = ['#B8E986', '#5AC8FA', '#AF52DE', '#FF9500', '#FF6B6B', '#20E3B2'];

const configureSmoothLayout = () => {
  LayoutAnimation.configureNext({
    duration: 240,
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.spring, springDamping: 0.82 },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  });
};

export default function App() {
  // Screen navigation: 'home' | 'scheduled' | 'backlog' | 'completed' | 'details' | 'search' | 'categories'
  const [currentScreen, setCurrentScreen] = useState('home');
  const [previousScreen, setPreviousScreen] = useState('home');

  // Screen horizontal transition animation
  const screenSlideAnim = useRef(new Animated.Value(0)).current;
  const screenFadeAnim = useRef(new Animated.Value(1)).current;

  // One UI Collapsible Header & Scroll-to-Top state
  const scrollY = useRef(new Animated.Value(0)).current;
  const mainScrollRef = useRef(null);
  const subScrollRef = useRef(null);
  const [showScrollTopBtn, setShowScrollTopBtn] = useState(false);

  // Core data (Starts empty)
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [now, setNow] = useState(Date.now());

  // Delayed completion animation state (shows checkmark + strikethrough before disappearing)
  const [completingIds, setCompletingIds] = useState([]);

  // Details screen task ID
  const [openedTaskId, setOpenedTaskId] = useState(null);

  // Multi-selection states (Tasks)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [moveCategoryModal, setMoveCategoryModal] = useState(false);

  // Multi-selection and Edit states (Categories)
  const [catSelectionMode, setCatSelectionMode] = useState(false);
  const [selectedCatIds, setSelectedCatIds] = useState([]);
  const [catModalVisible, setCatModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [catNameInput, setCatNameInput] = useState('');
  const [catColorInput, setCatColorInput] = useState(CATEGORY_COLORS[0]);

  // Popover Menus (3 dots & Sort by) with Scale Animation
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const popoverScaleAnim = useRef(new Animated.Value(0.85)).current;
  const popoverOpacityAnim = useRef(new Animated.Value(0)).current;
  const [sortBy, setSortBy] = useState('alertTime');
  const [sortOrder, setSortOrder] = useState('desc');

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFiltersOpen, setSearchFiltersOpen] = useState(true);
  const [activeSearchFilter, setActiveSearchFilter] = useState(null);

  // Bottom Sheet states & Animations
  const [sheetVisible, setSheetVisible] = useState(false);
  const sheetTranslateY = useRef(new Animated.Value(400)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [editingTaskId, setEditingTaskId] = useState(null);
  const [titleInput, setTitleInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [checklistInput, setChecklistInput] = useState([]);
  const [focusedCheckId, setFocusedCheckId] = useState(null);
  const checklistRefs = useRef({});

  const [difficultyInput, setDifficultyInput] = useState(1);
  const [focusMinutesInput, setFocusMinutesInput] = useState(30);
  const [urgencyInput, setUrgencyInput] = useState('normal');

  // Deadline states (3 suggestions + Custom)
  const [deadlineHoursInput, setDeadlineHoursInput] = useState(null);
  const [isCustomDeadline, setIsCustomDeadline] = useState(false);
  const [customDeadlineValue, setCustomDeadlineValue] = useState('');
  const [customDeadlineUnit, setCustomDeadlineUnit] = useState('hours');

  // Recurrence states
  const [recurrenceTypeInput, setRecurrenceTypeInput] = useState('none');
  const [weeklyQuotaInput, setWeeklyQuotaInput] = useState(3);
  const [targetDaysInput, setTargetDaysInput] = useState([1, 3, 5]);
  const [categoryInput, setCategoryInput] = useState('My reminders');
  const [activeSheetPanel, setActiveSheetPanel] = useState(null);
  const [inlineNewCatMode, setInlineNewCatMode] = useState(false);
  const [inlineNewCatName, setInlineNewCatName] = useState('');

  // Doing Mode (Freeze) timer setup modal
  const [doingSetupModal, setDoingSetupModal] = useState(false);
  const [customDoingMinutes, setCustomDoingMinutes] = useState('');

  const DAILY_CAPACITY = 4;

  // Interactive Drag-to-Dismiss PanResponder for Bottom Sheet
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 4,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          sheetTranslateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 65 || gestureState.vy > 0.75) {
          closeSheet();
        } else {
          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 22,
            stiffness: 220,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Day/week rollover check
  useEffect(() => {
    if (tasks.length === 0) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const currentWeekKey = getWeekKey(new Date());

    let changed = false;
    const updated = tasks.map((t) => {
      let copy = { ...t };
      if (copy.recurrenceType && copy.recurrenceType !== 'none') {
        if (copy.lastCompletedDate && copy.lastCompletedDate !== todayStr && copy.completedToday) {
          copy.completedToday = false;
          changed = true;
        }
        if (copy.weekKey !== currentWeekKey) {
          copy.weekKey = currentWeekKey;
          copy.weeklyCount = 0;
          copy.completedDaysThisWeek = [];
          changed = true;
        }
      }
      return copy;
    });

    if (changed) {
      saveTasks(updated);
    }
  }, [now]);

  const getWeekKey = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().slice(0, 10);
  };

  const loadData = async () => {
    try {
      const savedTasks = await AsyncStorage.getItem(STORAGE_TASKS_KEY);
      const savedCats = await AsyncStorage.getItem(STORAGE_CATS_KEY);
      if (savedTasks) setTasks(JSON.parse(savedTasks));
      if (savedCats) setCategories(JSON.parse(savedCats));
    } catch (e) {
      console.error('Failed to load data:', e);
    }
  };

  const saveTasks = async (newTasks) => {
    setTasks(newTasks);
    try {
      await AsyncStorage.setItem(STORAGE_TASKS_KEY, JSON.stringify(newTasks));
    } catch (e) {
      console.error('Failed to save tasks:', e);
    }
  };

  const saveCategories = async (newCats) => {
    setCategories(newCats);
    try {
      await AsyncStorage.setItem(STORAGE_CATS_KEY, JSON.stringify(newCats));
    } catch (e) {
      console.error('Failed to save categories:', e);
    }
  };

  // Smooth horizontal screen transition helper
  const animateScreenTransition = (targetScreen, direction = 'forward') => {
    const startX = direction === 'forward' ? SCREEN_WIDTH * 0.28 : -SCREEN_WIDTH * 0.28;
    setShowScrollTopBtn(false);
    screenSlideAnim.setValue(startX);
    screenFadeAnim.setValue(0.35);
    setCurrentScreen(targetScreen);

    Animated.parallel([
      Animated.timing(screenSlideAnim, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(screenFadeAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const navigateToSubScreen = (screenName) => {
    setSelectionMode(false);
    setSelectedTaskIds([]);
    setPreviousScreen(currentScreen);
    animateScreenTransition(screenName, 'forward');
  };

  const navigateBack = (fallback = 'home') => {
    setSelectionMode(false);
    setSelectedTaskIds([]);
    animateScreenTransition(fallback, 'back');
  };

  // Popover animation helper
  const openPopover = (type) => {
    popoverScaleAnim.setValue(0.85);
    popoverOpacityAnim.setValue(0);
    if (type === 'more') setMoreMenuVisible(true);
    if (type === 'sort') setSortMenuVisible(true);

    Animated.parallel([
      Animated.spring(popoverScaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 18,
        stiffness: 260,
      }),
      Animated.timing(popoverOpacityAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Dynamic Urgency & Critical State calculation
  const getEffectiveUrgency = (task) => {
    if (task.completed) return task.urgency;

    if (task.deadlineAt) {
      const hoursLeft = (task.deadlineAt - now) / (1000 * 60 * 60);
      if (hoursLeft <= 24) return 'critical';
      if (hoursLeft <= 72) return 'high';
      if (hoursLeft <= 168) return 'normal';
    }

    if (task.recurrenceType === 'daily' && !task.completedToday) {
      return 'critical';
    }

    if (task.recurrenceType === 'weekly' && !task.completedToday) {
      const count = task.weeklyCount || 0;
      const quota = task.weeklyQuota || 3;
      if (count >= quota) return 'low';

      const todayDay = new Date().getDay();
      const remainingToGoal = quota - count;
      const daysLeftInWeek = todayDay === 0 ? 1 : 8 - todayDay;

      if (daysLeftInWeek <= remainingToGoal) return 'critical';
      if ((task.targetDays || []).includes(todayDay)) return 'high';

      const yesterdayDay = todayDay === 0 ? 6 : todayDay - 1;
      const doneDays = task.completedDaysThisWeek || [];
      if ((task.targetDays || []).includes(yesterdayDay) && !doneDays.includes(yesterdayDay)) {
        return 'high';
      }
    }

    return task.urgency || 'normal';
  };

  // Daily Roll Algorithm
  const rollDailyMissions = () => {
    configureSmoothLayout();
    const activeUncompleted = tasks.filter((t) => !t.completed && !t.completedToday);

    const doingTask = activeUncompleted.find((t) => t.isDoing);
    let remainingCapacity = DAILY_CAPACITY - (doingTask ? doingTask.difficulty : 0);

    const selectedIds = new Set();
    if (doingTask) selectedIds.add(doingTask.id);

    const pool = activeUncompleted.filter((t) => {
      if (t.isDoing) return false;
      const effUrg = getEffectiveUrgency(t);
      if (effUrg === 'critical') return false;
      if (t.recurrenceType === 'weekly' && (t.weeklyCount || 0) >= (t.weeklyQuota || 3)) {
        return false;
      }
      return true;
    });

    let weightedPool = [];
    pool.forEach((task) => {
      const effUrg = getEffectiveUrgency(task);
      const tickets = effUrg === 'high' ? 6 : effUrg === 'normal' ? 3 : 1;
      for (let i = 0; i < tickets; i++) {
        weightedPool.push(task);
      }
    });

    let safety = 0;
    while (remainingCapacity > 0 && weightedPool.length > 0 && safety < 60) {
      safety++;
      const randIndex = Math.floor(Math.random() * weightedPool.length);
      const picked = weightedPool[randIndex];

      if (!selectedIds.has(picked.id)) {
        if (picked.difficulty <= remainingCapacity) {
          selectedIds.add(picked.id);
          remainingCapacity -= picked.difficulty;
        }
        weightedPool = weightedPool.filter((t) => t.id !== picked.id);
      }
    }

    const updated = tasks.map((t) => ({
      ...t,
      inDailyRoll: selectedIds.has(t.id),
      updatedAt: Date.now(),
    }));
    saveTasks(updated);
    setMoreMenuVisible(false);
  };

  // Checklist Helpers inside Bottom Sheet (Auto-focuses new item on Enter)
  const handleAddChecklistLine = () => {
    configureSmoothLayout();
    const newId = Date.now().toString() + Math.random().toString(36).slice(2, 6);
    const newItem = {
      id: newId,
      text: '',
      done: false,
    };
    setChecklistInput((prev) => [...prev, newItem]);
    setFocusedCheckId(newId);
    setTimeout(() => {
      if (checklistRefs.current[newId]) {
        checklistRefs.current[newId].focus();
      }
    }, 60);
  };

  const handleUpdateChecklistText = (id, text) => {
    setChecklistInput((prev) =>
      prev.map((item) => (item.id === id ? { ...item, text } : item))
    );
  };

  const handleToggleChecklistInSheet = (id) => {
    configureSmoothLayout();
    setChecklistInput((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    );
  };

  const handleRemoveChecklistLine = (id) => {
    configureSmoothLayout();
    setChecklistInput((prev) => prev.filter((item) => item.id !== id));
  };

  const toggleTaskChecklistItem = (taskId, checkItemId) => {
    configureSmoothLayout();
    const updated = tasks.map((t) => {
      if (t.id !== taskId) return t;
      const updatedList = (t.checklist || []).map((item) =>
        item.id === checkItemId ? { ...item, done: !item.done } : item
      );
      return { ...t, checklist: updatedList, updatedAt: Date.now() };
    });
    saveTasks(updated);
  };

  // Open / Close Animated Bottom Sheet
  const animateOpenSheet = () => {
    sheetTranslateY.setValue(380);
    backdropOpacity.setValue(0);
    setSheetVisible(true);

    Animated.parallel([
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 24,
        stiffness: 240,
        mass: 0.9,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSheet = () => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(sheetTranslateY, {
        toValue: 420,
        duration: 210,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setActiveSheetPanel(null);
      setSheetVisible(false);
    });
  };

  const openCreateSheet = () => {
    setEditingTaskId(null);
    setTitleInput('');
    setDescInput('');
    setChecklistInput([]);
    setFocusedCheckId(null);
    setDifficultyInput(1);
    setFocusMinutesInput(30);
    setUrgencyInput('normal');
    setDeadlineHoursInput(null);
    setIsCustomDeadline(false);
    setCustomDeadlineValue('');
    setCustomDeadlineUnit('hours');
    setRecurrenceTypeInput('none');
    setWeeklyQuotaInput(3);
    setTargetDaysInput([1, 3, 5]);
    setCategoryInput('My reminders');
    setActiveSheetPanel(null);
    setInlineNewCatMode(false);
    animateOpenSheet();
  };

  const openEditSheet = (task) => {
    setEditingTaskId(task.id);
    setTitleInput(task.title);
    setDescInput(task.description || '');
    setChecklistInput(task.checklist ? [...task.checklist] : []);
    setFocusedCheckId(null);
    setDifficultyInput(task.difficulty || 1);
    setFocusMinutesInput(task.focusMinutes || 30);
    setUrgencyInput(task.urgency || 'normal');
    const hrs = task.deadlineAt
      ? Math.max(1, Math.round((task.deadlineAt - Date.now()) / 3600000))
      : null;
    setDeadlineHoursInput(hrs);
    setIsCustomDeadline(hrs !== null && ![3, 24, 72].includes(hrs));
    setCustomDeadlineValue(hrs !== null && ![3, 24, 72].includes(hrs) ? String(hrs) : '');
    setCustomDeadlineUnit('hours');
    setRecurrenceTypeInput(task.recurrenceType || 'none');
    setWeeklyQuotaInput(task.weeklyQuota || 3);
    setTargetDaysInput(task.targetDays || [1, 3, 5]);
    setCategoryInput(task.category || 'My reminders');
    setActiveSheetPanel(null);
    setInlineNewCatMode(false);
    animateOpenSheet();
  };

  const handleSaveTask = () => {
    const cleanChecklist = checklistInput.filter((item) => item.text.trim().length > 0);
    if (!titleInput.trim() && cleanChecklist.length === 0) {
      closeSheet();
      return;
    }

    configureSmoothLayout();
    const finalTitle = titleInput.trim() || cleanChecklist[0]?.text || 'Untitled reminder';
    const timestamp = Date.now();
    const createdDateStr = formatShortDate(new Date(timestamp));

    let effectiveDeadlineHours = deadlineHoursInput;
    if (isCustomDeadline && customDeadlineValue) {
      const parsed = parseFloat(customDeadlineValue);
      if (!isNaN(parsed) && parsed > 0) {
        effectiveDeadlineHours =
          customDeadlineUnit === 'days' ? parsed * 24 : parsed;
      }
    }

    const computedDeadline = effectiveDeadlineHours
      ? timestamp + effectiveDeadlineHours * 3600 * 1000
      : null;

    if (editingTaskId) {
      const updated = tasks.map((t) =>
        t.id === editingTaskId
          ? {
              ...t,
              title: finalTitle,
              description: descInput.trim(),
              checklist: cleanChecklist,
              difficulty: difficultyInput,
              focusMinutes: focusMinutesInput,
              urgency: urgencyInput,
              deadlineAt: computedDeadline,
              deadlineCreatedAt: computedDeadline ? t.deadlineCreatedAt || timestamp : null,
              recurrenceType: recurrenceTypeInput,
              weeklyQuota: weeklyQuotaInput,
              targetDays: targetDaysInput,
              category: categoryInput,
              updatedAt: timestamp,
            }
          : t
      );
      saveTasks(updated);
    } else {
      const newTask = {
        id: timestamp.toString(),
        title: finalTitle,
        description: descInput.trim(),
        checklist: cleanChecklist,
        category: categoryInput,
        difficulty: difficultyInput,
        focusMinutes: focusMinutesInput,
        urgency: urgencyInput,
        createdAt: timestamp,
        createdDateStr,
        updatedAt: timestamp,
        deadlineCreatedAt: computedDeadline ? timestamp : null,
        deadlineAt: computedDeadline,
        recurrenceType: recurrenceTypeInput,
        weeklyQuota: weeklyQuotaInput,
        targetDays: targetDaysInput,
        weeklyCount: 0,
        completedDaysThisWeek: [],
        weekKey: getWeekKey(new Date()),
        completed: false,
        completedToday: false,
        inDailyRoll: true,
        descExpanded: true,
        isDoing: false,
        doingStartedAt: null,
        doingDurationMs: null,
      };
      saveTasks([newTask, ...tasks]);
    }
    closeSheet();
  };

  // Complete / Uncomplete Task with visual pause (just like 00:46-00:48 in reference video)
  const commitToggleComplete = (taskId) => {
    configureSmoothLayout();
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayDay = new Date().getDay();
    const timeLabel = formatTimeAMPM(new Date());
    const fullDateLabel = formatCompletedDateString(new Date());

    const updated = tasks.map((t) => {
      if (t.id !== taskId) return t;

      if (t.recurrenceType && t.recurrenceType !== 'none' && !t.completed) {
        const alreadyDoneToday = t.completedToday;
        const nextCount = alreadyDoneToday
          ? Math.max(0, (t.weeklyCount || 1) - 1)
          : (t.weeklyCount || 0) + 1;
        const nextDays = alreadyDoneToday
          ? (t.completedDaysThisWeek || []).filter((d) => d !== todayDay)
          : [...new Set([...(t.completedDaysThisWeek || []), todayDay])];

        return {
          ...t,
          completedToday: !alreadyDoneToday,
          lastCompletedDate: !alreadyDoneToday ? todayStr : null,
          weeklyCount: nextCount,
          completedDaysThisWeek: nextDays,
          isDoing: false,
          updatedAt: Date.now(),
        };
      }

      const nextCompleted = !t.completed;
      return {
        ...t,
        completed: nextCompleted,
        completedAtText: nextCompleted ? `Completed: ${fullDateLabel}, ${timeLabel}` : null,
        completedTimestamp: nextCompleted ? Date.now() : null,
        isDoing: false,
        updatedAt: Date.now(),
      };
    });

    saveTasks(updated);
  };

  const toggleTaskComplete = (taskId) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;

    const isCurrentlyDone = target.completed || target.completedToday;
    if (!isCurrentlyDone) {
      // Visual feedback pause before moving out of active list
      setCompletingIds((prev) => [...prev, taskId]);
      setTimeout(() => {
        setCompletingIds((prev) => prev.filter((id) => id !== taskId));
        commitToggleComplete(taskId);
      }, 420);
    } else {
      commitToggleComplete(taskId);
    }
  };

  const toggleDescExpand = (taskId) => {
    configureSmoothLayout();
    const updated = tasks.map((t) =>
      t.id === taskId ? { ...t, descExpanded: !t.descExpanded } : t
    );
    saveTasks(updated);
  };

  // Doing Mode (1 at a time, max 24h)
  const startDoingTask = (task, minutesOverride) => {
    const currentDoing = tasks.find((t) => t.isDoing && t.id !== task.id && !t.completed);
    if (currentDoing) {
      Alert.alert(
        'Active Focus Limit',
        `"${currentDoing.title}" is already in Doing mode. Complete or pause it before starting another.`
      );
      return;
    }

    configureSmoothLayout();
    const clampedMinutes = Math.min(1440, Math.max(1, minutesOverride || task.focusMinutes || 30));
    const updated = tasks.map((t) =>
      t.id === task.id
        ? {
            ...t,
            isDoing: !t.isDoing,
            inDailyRoll: true,
            doingStartedAt: !t.isDoing ? Date.now() : null,
            doingDurationMs: !t.isDoing ? clampedMinutes * 60 * 1000 : null,
          }
        : t
    );
    saveTasks(updated);
    setDoingSetupModal(false);
    setCustomDoingMinutes('');
  };

  // Multi-selection for Tasks
  const handleTaskLongPress = (taskId) => {
    configureSmoothLayout();
    setSelectionMode(true);
    setSelectedTaskIds([taskId]);
  };

  const toggleSelectTask = (taskId) => {
    if (selectedTaskIds.includes(taskId)) {
      const next = selectedTaskIds.filter((id) => id !== taskId);
      setSelectedTaskIds(next);
      if (next.length === 0) setSelectionMode(false);
    } else {
      setSelectedTaskIds([...selectedTaskIds, taskId]);
    }
  };

  const handleBatchComplete = () => {
    configureSmoothLayout();
    const timeLabel = formatTimeAMPM(new Date());
    const fullDateLabel = formatCompletedDateString(new Date());
    const updated = tasks.map((t) =>
      selectedTaskIds.includes(t.id)
        ? {
            ...t,
            completed: true,
            completedAtText: `Completed: ${fullDateLabel}, ${timeLabel}`,
            completedTimestamp: Date.now(),
            isDoing: false,
          }
        : t
    );
    saveTasks(updated);
    setSelectionMode(false);
    setSelectedTaskIds([]);
  };

  const handleBatchImportant = () => {
    configureSmoothLayout();
    const updated = tasks.map((t) =>
      selectedTaskIds.includes(t.id)
        ? { ...t, urgency: t.urgency === 'high' ? 'normal' : 'high' }
        : t
    );
    saveTasks(updated);
    setSelectionMode(false);
    setSelectedTaskIds([]);
  };

  const handleBatchDelete = () => {
    configureSmoothLayout();
    const updated = tasks.filter((t) => !selectedTaskIds.includes(t.id));
    saveTasks(updated);
    setSelectionMode(false);
    setSelectedTaskIds([]);
  };

  const handleBatchMoveCategory = (catName) => {
    configureSmoothLayout();
    const updated = tasks.map((t) =>
      selectedTaskIds.includes(t.id) ? { ...t, category: catName } : t
    );
    saveTasks(updated);
    setMoveCategoryModal(false);
    setSelectionMode(false);
    setSelectedTaskIds([]);
  };

  // Category Management
  const handleSaveCategoryModal = () => {
    if (!catNameInput.trim()) return;
    configureSmoothLayout();
    const trimmed = catNameInput.trim();

    if (editingCategory) {
      const updatedCats = categories.map((c) =>
        c.id === editingCategory.id ? { ...c, name: trimmed, color: catColorInput } : c
      );
      const updatedTasks = tasks.map((t) =>
        t.category === editingCategory.name ? { ...t, category: trimmed } : t
      );
      saveCategories(updatedCats);
      saveTasks(updatedTasks);
    } else {
      const newCat = {
        id: Date.now().toString(),
        name: trimmed,
        color: catColorInput,
      };
      saveCategories([...categories, newCat]);
    }
    setCatModalVisible(false);
    setEditingCategory(null);
    setCatNameInput('');
  };

  const handleDeleteSingleCategory = (cat) => {
    configureSmoothLayout();
    const updatedCats = categories.filter((c) => c.id !== cat.id);
    const updatedTasks = tasks.map((t) =>
      t.category === cat.name ? { ...t, category: 'My reminders' } : t
    );
    saveCategories(updatedCats);
    saveTasks(updatedTasks);
    setCatModalVisible(false);
  };

  const handleBatchDeleteCategories = () => {
    configureSmoothLayout();
    const namesToRemove = categories
      .filter((c) => selectedCatIds.includes(c.id))
      .map((c) => c.name);
    const updatedCats = categories.filter((c) => !selectedCatIds.includes(c.id));
    const updatedTasks = tasks.map((t) =>
      namesToRemove.includes(t.category) ? { ...t, category: 'My reminders' } : t
    );
    saveCategories(updatedCats);
    saveTasks(updatedTasks);
    setCatSelectionMode(false);
    setSelectedCatIds([]);
  };

  // Sort Tasks List
  const sortTasksList = (list) => {
    const copy = [...list];
    copy.sort((a, b) => {
      if (a.isDoing && !b.isDoing) return -1;
      if (!a.isDoing && b.isDoing) return 1;

      let comp = 0;
      if (sortBy === 'title') {
        comp = a.title.localeCompare(b.title);
      } else if (sortBy === 'dateModified') {
        comp = (a.updatedAt || a.createdAt) - (b.updatedAt || b.createdAt);
      } else if (sortBy === 'category') {
        comp = (a.category || '').localeCompare(b.category || '');
      } else {
        const aTime = a.deadlineAt || 9999999999999;
        const bTime = b.deadlineAt || 9999999999999;
        comp = aTime - bTime;
      }
      return sortOrder === 'asc' ? comp : -comp;
    });
    return copy;
  };

  const scheduledTasks = tasks.filter((t) => !t.completed && t.deadlineAt !== null);
  const backlogTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  const mainRolledTasks = sortTasksList(
    tasks.filter((t) => {
      if (t.completed || t.completedToday) return false;
      const effUrg = getEffectiveUrgency(t);
      return t.isDoing || effUrg === 'critical' || t.inDailyRoll;
    })
  );

  // Task Card Renderer (supports standalone card or grouped divider row)
  const renderTaskCard = (task, isGroupedItem = false, isLastInGroup = true) => {
    const isSelected = selectedTaskIds.includes(task.id);
    const isCompletingNow = completingIds.includes(task.id);
    const visualDone = task.completed || task.completedToday || isCompletingNow;
    const effUrg = getEffectiveUrgency(task);
    const isUrgentOrCritical = effUrg === 'high' || effUrg === 'critical';
    const hasExpandableContent =
      Boolean(task.description) || (task.checklist && task.checklist.length > 0);

    // Bottom Deadline Bar calculation
    let deadlinePercent = null;
    let deadlineColor = '#4A90E2';
    let deadlineLabel = '';
    if (task.deadlineAt && !task.completed) {
      const start = task.deadlineCreatedAt || task.createdAt;
      const total = Math.max(1, task.deadlineAt - start);
      const remaining = task.deadlineAt - now;
      deadlinePercent = Math.min(100, Math.max(0, (remaining / total) * 100));
      if (remaining <= 0) {
        deadlineColor = '#FF453A';
        deadlineLabel = 'Overdue';
      } else {
        if (deadlinePercent < 20) deadlineColor = '#FF453A';
        else if (deadlinePercent < 50) deadlineColor = '#E87330';
        deadlineLabel = formatRemainingTime(remaining);
      }
    }

    // Doing Mode Stopwatch calculation
    let doingRemainingMs = null;
    let doingIsEnding = false;
    if (task.isDoing && task.doingStartedAt && task.doingDurationMs) {
      doingRemainingMs = task.doingStartedAt + task.doingDurationMs - now;
      const ratio = doingRemainingMs / task.doingDurationMs;
      if (ratio <= 0.2 || doingRemainingMs <= 10 * 60 * 1000) {
        doingIsEnding = true;
      }
    }

    return (
      <Pressable
        key={task.id}
        style={[
          isGroupedItem ? styles.groupedReminderRow : styles.reminderCard,
          task.isDoing && !isGroupedItem && styles.reminderCardDoing,
          isSelected && styles.reminderCardSelected,
          isCompletingNow && { opacity: 0.65 },
        ]}
        onPress={() => {
          if (selectionMode) {
            toggleSelectTask(task.id);
          } else {
            setOpenedTaskId(task.id);
            navigateToSubScreen('details');
          }
        }}
        onLongPress={() => handleTaskLongPress(task.id)}
      >
        <View
          style={[
            styles.cardInnerRow,
            isGroupedItem && !isLastInGroup && styles.groupedRowDivider,
          ]}
        >
          <TouchableOpacity
            style={[
              styles.circleCheck,
              (visualDone || (selectionMode && isSelected)) && styles.circleCheckBeige,
            ]}
            onPress={() => {
              if (selectionMode) {
                toggleSelectTask(task.id);
              } else {
                toggleTaskComplete(task.id);
              }
            }}
          >
            {(visualDone || (selectionMode && isSelected)) && (
              <Text style={styles.checkMarkDark}>✓</Text>
            )}
          </TouchableOpacity>

          <View style={styles.cardTextContent}>
            <View style={styles.titleRow}>
              <Text
                style={[
                  styles.cardTitle,
                  visualDone && styles.cardTitleCompleted,
                ]}
              >
                {task.title}
              </Text>
              {isUrgentOrCritical && !visualDone && <View style={styles.orangeDot} />}
            </View>

            {task.isDoing && (
              <View style={[styles.doingBadge, doingIsEnding && styles.doingBadgeEnding]}>
                <Text
                  style={[
                    styles.doingBadgeText,
                    doingIsEnding && { color: '#FF453A' },
                  ]}
                >
                  ⏱️ Doing: {formatStopwatch(doingRemainingMs)}{' '}
                  {doingIsEnding ? '• ⚠️ Time almost up!' : '• Pinned'}
                </Text>
              </View>
            )}

            {task.descExpanded && (
              <>
                {task.description ? (
                  <Text style={styles.cardDescription}>{task.description}</Text>
                ) : null}

                {task.checklist && task.checklist.length > 0 && (
                  <View style={styles.cardChecklistContainer}>
                    {task.checklist.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.cardChecklistRow}
                        activeOpacity={0.7}
                        onPress={() => toggleTaskChecklistItem(task.id, item.id)}
                      >
                        <View
                          style={[
                            styles.miniCircleCheck,
                            item.done && styles.circleCheckBeige,
                          ]}
                        >
                          {item.done && <Text style={styles.miniCheckMarkDark}>✓</Text>}
                        </View>
                        <Text
                          style={[
                            styles.cardChecklistText,
                            item.done && styles.cardTitleCompleted,
                          ]}
                        >
                          {item.text}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}

            <Text
              style={[
                styles.cardMeta,
                task.deadlineAt && task.deadlineAt < now && !visualDone && { color: '#E87330' },
              ]}
            >
              {task.completed
                ? task.completedAtText
                : [
                    task.category !== 'My reminders' ? task.category : null,
                    task.difficulty === 1 ? 'Easy' : task.difficulty === 2 ? 'Medium' : 'Hard',
                    effUrg === 'critical' ? 'Pinned/Urgent' : null,
                    task.deadlineAt ? deadlineLabel : null,
                    task.recurrenceType === 'daily' ? 'Daily' : null,
                    task.recurrenceType === 'weekly'
                      ? `${task.weeklyCount || 0}/${task.weeklyQuota} this week`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' • ')}
            </Text>
          </View>

          {hasExpandableContent ? (
            <TouchableOpacity
              style={styles.chevronBtn}
              onPress={() => toggleDescExpand(task.id)}
            >
              <Text style={styles.chevronIcon}>{task.descExpanded ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {deadlinePercent !== null && (
          <View style={styles.deadlineBarTrack}>
            <View
              style={[
                styles.deadlineBarFill,
                { width: `${deadlinePercent}%`, backgroundColor: deadlineColor },
              ]}
            />
          </View>
        )}
      </Pressable>
    );
  };

  const renderSortedTaskList = (list) => {
    if (list.length === 0) {
      return (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No reminders</Text>
          <Text style={styles.emptySub}>
            Tap "Add reminder" below to create one, or tap 🎲 to roll your daily quests.
          </Text>
        </View>
      );
    }

    if (sortBy === 'category') {
      const grouped = {};
      list.forEach((t) => {
        const cat = t.category || 'My reminders';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(t);
      });

      return Object.keys(grouped).map((catName) => (
        <View key={catName} style={styles.groupSection}>
          <Text style={styles.groupHeaderLabel}>{catName}</Text>
          {grouped[catName].map((t) => renderTaskCard(t))}
        </View>
      ));
    }

    return list.map((t) => renderTaskCard(t));
  };

  // Group completed tasks by period (Last 7 days / Month) inside unified rounded cards (00:49-00:52)
  const renderGroupedCompletedList = (list) => {
    if (list.length === 0) {
      return (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No completed reminders</Text>
        </View>
      );
    }

    const groups = {};
    const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    list.forEach((t) => {
      const ts = t.completedTimestamp || t.updatedAt || t.createdAt;
      let label = 'Last 7 days';
      if (ts < sevenDaysAgo) {
        const d = new Date(ts);
        label = months[d.getMonth()];
      }
      if (!groups[label]) groups[label] = [];
      groups[label].push(t);
    });

    return Object.keys(groups).map((groupLabel) => {
      const items = groups[groupLabel];
      return (
        <View key={groupLabel} style={styles.groupSection}>
          <Text style={styles.groupHeaderLabel}>{groupLabel}</Text>
          <View style={styles.groupedCardContainer}>
            {items.map((item, idx) =>
              renderTaskCard(item, true, idx === items.length - 1)
            )}
          </View>
        </View>
      );
    });
  };

  // Task Details Screen
  const renderDetailsScreen = () => {
    const task = tasks.find((t) => t.id === openedTaskId);
    if (!task) {
      setCurrentScreen('home');
      return null;
    }

    const catObj = categories.find((c) => c.name === task.category);

    return (
      <Animated.View
        style={[
          styles.safeArea,
          { opacity: screenFadeAnim, transform: [{ translateX: screenSlideAnim }] },
        ]}
      >
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.subScreenHeader}>
            <TouchableOpacity
              onPress={() => navigateBack(previousScreen)}
              style={styles.backBtn}
            >
              <Text style={styles.backArrow}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                const nextUrg = task.urgency === 'high' ? 'normal' : 'high';
                saveTasks(
                  tasks.map((t) => (t.id === task.id ? { ...t, urgency: nextUrg } : t))
                );
              }}
            >
              <Text style={styles.starIcon}>{task.urgency === 'high' ? '★' : '☆'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.detailsMainCard}>
            <Text style={styles.detailsTitleText}>{task.title}</Text>
            {task.description ? (
              <Text style={styles.detailsDescText}>{task.description}</Text>
            ) : null}

            {task.checklist && task.checklist.length > 0 && (
              <View style={{ marginBottom: 10 }}>
                {task.checklist.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.cardChecklistRow}
                    onPress={() => toggleTaskChecklistItem(task.id, item.id)}
                  >
                    <View
                      style={[
                        styles.miniCircleCheck,
                        item.done && styles.circleCheckBeige,
                      ]}
                    >
                      {item.done && <Text style={styles.miniCheckMarkDark}>✓</Text>}
                    </View>
                    <Text
                      style={[
                        styles.cardChecklistText,
                        item.done && styles.cardTitleCompleted,
                      ]}
                    >
                      {item.text}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.detailsDivider} />

            <View style={styles.detailsCategoryRow}>
              <Text style={[styles.detailsCatIcon, { color: catObj ? catObj.color : '#B8E986' }]}>
                ☰
              </Text>
              <Text style={styles.detailsCatName}>{task.category || 'My reminders'}</Text>
            </View>

            <View style={styles.detailsMetaTags}>
              <Text style={styles.detailsMetaTagText}>
                Weight: {task.difficulty === 1 ? 'Easy' : task.difficulty === 2 ? 'Medium' : 'Hard'}
              </Text>
              {task.deadlineAt && (
                <Text style={styles.detailsMetaTagText}>
                  • Deadline: {formatRemainingTime(task.deadlineAt - now)}
                </Text>
              )}
              {task.recurrenceType === 'weekly' && (
                <Text style={styles.detailsMetaTagText}>
                  • Weekly goal: {task.weeklyCount || 0}/{task.weeklyQuota}
                </Text>
              )}
            </View>
          </View>

          <Text style={styles.createdDateLabel}>
            Created: {task.createdDateStr || '06/11/26'}
          </Text>

          <View style={styles.bottomActionPillWrapper}>
            <View style={styles.bottomActionPill}>
              <TouchableOpacity
                style={styles.actionPillBtn}
                onPress={() => {
                  commitToggleComplete(task.id);
                  navigateBack(previousScreen);
                }}
              >
                <Text style={styles.actionPillIcon}>✓</Text>
                <Text style={styles.actionPillLabel}>
                  {task.completed ? 'Uncomplete' : 'Complete'}
                </Text>
              </TouchableOpacity>

              {!task.completed && (
                <TouchableOpacity
                  style={styles.actionPillBtn}
                  onPress={() => {
                    if (task.isDoing) {
                      startDoingTask(task);
                    } else {
                      setDoingSetupModal(true);
                    }
                  }}
                >
                  <Text style={styles.actionPillIcon}>{task.isDoing ? '⏸' : '▶'}</Text>
                  <Text style={styles.actionPillLabel}>
                    {task.isDoing ? 'Pause' : 'Doing'}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.actionPillBtn}
                onPress={() => openEditSheet(task)}
              >
                <Text style={styles.actionPillIcon}>✎</Text>
                <Text style={styles.actionPillLabel}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionPillBtn}
                onPress={() => {
                  configureSmoothLayout();
                  saveTasks(tasks.filter((t) => t.id !== task.id));
                  navigateBack(previousScreen);
                }}
              >
                <Text style={styles.actionPillIcon}>🗑</Text>
                <Text style={styles.actionPillLabel}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Animated.View>
    );
  };

  // Manage Categories Screen
  const renderManageCategoriesScreen = () => {
    return (
      <Animated.View
        style={[
          styles.safeArea,
          { opacity: screenFadeAnim, transform: [{ translateX: screenSlideAnim }] },
        ]}
      >
        <SafeAreaView style={styles.safeArea}>
          {catSelectionMode ? (
            <View style={styles.selectionHeader}>
              <TouchableOpacity
                style={styles.selectAllCircleWrap}
                onPress={() => {
                  if (selectedCatIds.length === categories.length) {
                    setSelectedCatIds([]);
                  } else {
                    setSelectedCatIds(categories.map((c) => c.id));
                  }
                }}
              >
                <View
                  style={[
                    styles.circleCheck,
                    selectedCatIds.length === categories.length &&
                      categories.length > 0 &&
                      styles.circleCheckBeige,
                  ]}
                >
                  {selectedCatIds.length === categories.length && categories.length > 0 && (
                    <Text style={styles.checkMarkDark}>✓</Text>
                  )}
                </View>
                <Text style={styles.selectAllSmallText}>All</Text>
              </TouchableOpacity>
              <Text style={styles.selectionTitle}>{selectedCatIds.length} selected</Text>
              <TouchableOpacity
                onPress={() => {
                  setCatSelectionMode(false);
                  setSelectedCatIds([]);
                }}
              >
                <Text style={styles.cancelTextBtn}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.subScreenHeader}>
              <View style={styles.rowCenter}>
                <TouchableOpacity
                  onPress={() => navigateBack('home')}
                  style={styles.backBtn}
                >
                  <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.subScreenTitle}>Manage categories</Text>
              </View>
            </View>
          )}

          <ScrollView contentContainerStyle={styles.scrollContent}>
            <TouchableOpacity
              style={styles.reminderCard}
              onPress={() => {
                setEditingCategory(null);
                setCatNameInput('');
                setCatColorInput(CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]);
                setCatModalVisible(true);
              }}
            >
              <View style={styles.cardInnerRow}>
                <Text style={styles.greenPlusBig}>＋</Text>
                <Text style={styles.cardTitle}>Add category</Text>
              </View>
            </TouchableOpacity>

            <View style={[styles.reminderCard, { opacity: 0.7 }]}>
              <View style={styles.cardInnerRow}>
                <Text style={[styles.detailsCatIcon, { color: '#B8E986', marginRight: 14 }]}>
                  ☰
                </Text>
                <Text style={[styles.cardTitle, { flex: 1 }]}>My reminders</Text>
                <Text style={styles.bentoCount}>
                  {tasks.filter((t) => !t.completed && t.category === 'My reminders').length}
                </Text>
              </View>
            </View>

            {categories.map((cat) => {
              const isSelected = selectedCatIds.includes(cat.id);
              const count = tasks.filter((t) => !t.completed && t.category === cat.name).length;

              return (
                <Pressable
                  key={cat.id}
                  style={[styles.reminderCard, isSelected && styles.reminderCardSelected]}
                  onPress={() => {
                    if (catSelectionMode) {
                      if (isSelected) {
                        const next = selectedCatIds.filter((id) => id !== cat.id);
                        setSelectedCatIds(next);
                        if (next.length === 0) setCatSelectionMode(false);
                      } else {
                        setSelectedCatIds([...selectedCatIds, cat.id]);
                      }
                    } else {
                      setEditingCategory(cat);
                      setCatNameInput(cat.name);
                      setCatColorInput(cat.color);
                      setCatModalVisible(true);
                    }
                  }}
                  onLongPress={() => {
                    configureSmoothLayout();
                    setCatSelectionMode(true);
                    setSelectedCatIds([cat.id]);
                  }}
                >
                  <View style={styles.cardInnerRow}>
                    {catSelectionMode && (
                      <View
                        style={[styles.circleCheck, isSelected && styles.circleCheckBeige]}
                      >
                        {isSelected && <Text style={styles.checkMarkDark}>✓</Text>}
                      </View>
                    )}
                    <View style={[styles.catDotLarge, { backgroundColor: cat.color }]} />
                    <Text style={[styles.cardTitle, { flex: 1 }]}>{cat.name}</Text>
                    <Text style={styles.bentoCount}>{count}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {catSelectionMode && (
            <View style={styles.bottomActionPillWrapper}>
              <View style={styles.bottomActionPill}>
                {selectedCatIds.length === 1 && (
                  <TouchableOpacity
                    style={styles.actionPillBtn}
                    onPress={() => {
                      const cat = categories.find((c) => c.id === selectedCatIds[0]);
                      if (cat) {
                        setCatSelectionMode(false);
                        setSelectedCatIds([]);
                        setEditingCategory(cat);
                        setCatNameInput(cat.name);
                        setCatColorInput(cat.color);
                        setCatModalVisible(true);
                      }
                    }}
                  >
                    <Text style={styles.actionPillIcon}>✎</Text>
                    <Text style={styles.actionPillLabel}>Edit</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.actionPillBtn}
                  onPress={handleBatchDeleteCategories}
                >
                  <Text style={styles.actionPillIcon}>🗑</Text>
                  <Text style={styles.actionPillLabel}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </SafeAreaView>
      </Animated.View>
    );
  };

  // Search Screen
  const renderSearchScreen = () => {
    const filtered = tasks.filter((t) => {
      const matchesText =
        !searchQuery.trim() ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.category || '').toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesText) return false;
      if (activeSearchFilter === 'completed') return t.completed;
      if (activeSearchFilter === 'checklists')
        return t.checklist && t.checklist.length > 0;
      if (activeSearchFilter === 'scheduled') return t.deadlineAt !== null;
      if (activeSearchFilter === 'important')
        return getEffectiveUrgency(t) === 'high' || getEffectiveUrgency(t) === 'critical';
      if (activeSearchFilter) return t.category === activeSearchFilter;
      return true;
    });

    return (
      <Animated.View
        style={[
          styles.safeArea,
          { opacity: screenFadeAnim, transform: [{ translateX: screenSlideAnim }] },
        ]}
      >
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.subScreenHeader}>
            <TouchableOpacity onPress={() => navigateBack('home')} style={styles.backBtn}>
              <Text style={styles.backArrow}>‹</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderText}>Filters</Text>
              <TouchableOpacity
                onPress={() => {
                  configureSmoothLayout();
                  setSearchFiltersOpen(!searchFiltersOpen);
                }}
              >
                <Text style={styles.chevronIcon}>{searchFiltersOpen ? '⌃' : '⌄'}</Text>
              </TouchableOpacity>
            </View>

            {searchFiltersOpen && (
              <View style={styles.searchFiltersCard}>
                {[
                  { key: 'completed', label: 'Completed' },
                  { key: 'checklists', label: 'Checklists' },
                  { key: 'scheduled', label: 'Scheduled' },
                  { key: 'important', label: 'Important' },
                  ...categories.map((c) => ({ key: c.name, label: c.name })),
                ].map((f) => {
                  const active = activeSearchFilter === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[styles.filterPillOutline, active && styles.filterPillActive]}
                      onPress={() => {
                        configureSmoothLayout();
                        setActiveSearchFilter(active ? null : f.key);
                      }}
                    >
                      <Text style={[styles.filterPillText, active && { color: '#FFF' }]}>
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={{ marginTop: 16 }}>
              {filtered.map((t) => renderTaskCard(t))}
            </View>
          </ScrollView>

          <View style={styles.bottomFloatingWrapper}>
            <View style={styles.searchBottomBar}>
              <TextInput
                style={styles.searchBottomInput}
                placeholder="Search"
                placeholderTextColor="#8E8E98"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Text style={{ color: '#8E8E98', paddingHorizontal: 10 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </SafeAreaView>
      </Animated.View>
    );
  };

  // Dedicated Sub-screens for the 3 Top Blocks ('scheduled' | 'backlog' | 'completed')
  const renderBlockSubScreen = () => {
    let title = 'Backlog';
    let currentList = [];

    if (currentScreen === 'scheduled') {
      title = 'Scheduled';
      currentList = sortTasksList(scheduledTasks);
    } else if (currentScreen === 'backlog') {
      title = 'Backlog';
      currentList = sortTasksList(backlogTasks);
    } else if (currentScreen === 'completed') {
      title = 'Completed';
      currentList = sortTasksList(completedTasks);
    }

    const pastList =
      currentScreen === 'scheduled' ? currentList.filter((t) => t.deadlineAt < now) : [];
    const soonList =
      currentScreen === 'scheduled' ? currentList.filter((t) => t.deadlineAt >= now) : [];

    return (
      <Animated.View
        style={[
          styles.safeArea,
          { opacity: screenFadeAnim, transform: [{ translateX: screenSlideAnim }] },
        ]}
      >
        <SafeAreaView style={styles.safeArea}>
          {selectionMode ? (
            <View style={styles.selectionHeader}>
              <TouchableOpacity
                style={styles.selectAllCircleWrap}
                onPress={() => {
                  if (selectedTaskIds.length === currentList.length) {
                    setSelectedTaskIds([]);
                  } else {
                    setSelectedTaskIds(currentList.map((t) => t.id));
                  }
                }}
              >
                <View
                  style={[
                    styles.circleCheck,
                    selectedTaskIds.length === currentList.length &&
                      currentList.length > 0 &&
                      styles.circleCheckBeige,
                  ]}
                >
                  {selectedTaskIds.length === currentList.length && currentList.length > 0 && (
                    <Text style={styles.checkMarkDark}>✓</Text>
                  )}
                </View>
                <Text style={styles.selectAllSmallText}>All</Text>
              </TouchableOpacity>
              <Text style={styles.selectionTitle}>Select reminders</Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectionMode(false);
                  setSelectedTaskIds([]);
                }}
              >
                <Text style={styles.cancelTextBtn}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.subScreenHeader}>
              <View style={styles.rowCenter}>
                <TouchableOpacity
                  onPress={() => navigateBack('home')}
                  style={styles.backBtn}
                >
                  <Text style={styles.backArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.subScreenTitle}>{title}</Text>
              </View>
              <View style={styles.headerIconsPill}>
                <TouchableOpacity
                  onPress={() => navigateToSubScreen('search')}
                  style={styles.headerIconBtn}
                >
                  <Text style={styles.headerIconText}>🔍</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => openPopover('more')}
                  style={styles.headerIconBtn}
                >
                  <Text style={styles.headerIconText}>⋮</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <ScrollView
            ref={subScrollRef}
            contentContainerStyle={styles.scrollContent}
            onScroll={(e) => {
              const offsetY = e.nativeEvent.contentOffset.y;
              setShowScrollTopBtn(offsetY > 180);
            }}
            scrollEventThrottle={16}
          >
            {currentScreen === 'scheduled' ? (
              <>
                {pastList.length > 0 && (
                  <View style={styles.groupSection}>
                    <Text style={styles.groupHeaderLabel}>Past</Text>
                    {pastList.map((t) => renderTaskCard(t))}
                  </View>
                )}
                {soonList.length > 0 && (
                  <View style={styles.groupSection}>
                    <Text style={styles.groupHeaderLabel}>Soon</Text>
                    {soonList.map((t) => renderTaskCard(t))}
                  </View>
                )}
                {pastList.length === 0 && soonList.length === 0 && (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyTitle}>No scheduled reminders</Text>
                  </View>
                )}
              </>
            ) : currentScreen === 'completed' ? (
              renderGroupedCompletedList(currentList)
            ) : (
              renderSortedTaskList(currentList)
            )}
          </ScrollView>

          {showScrollTopBtn && (
            <TouchableOpacity
              style={styles.scrollTopFloatingBtn}
              onPress={() => subScrollRef.current?.scrollTo({ y: 0, animated: true })}
            >
              <Text style={styles.scrollTopIcon}>⌃</Text>
            </TouchableOpacity>
          )}

          {selectionMode ? (
            renderBatchActionPill()
          ) : (
            <View style={styles.bottomFloatingWrapper}>
              <TouchableOpacity
                style={styles.addReminderPill}
                activeOpacity={0.85}
                onPress={openCreateSheet}
              >
                <Text style={styles.addReminderPlaceholder}>Add reminder</Text>
                <Text style={styles.micIcon}>🎤</Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Animated.View>
    );
  };

  const renderBatchActionPill = () => (
    <View style={styles.bottomActionPillWrapper}>
      <View style={styles.bottomActionPill}>
        <TouchableOpacity style={styles.actionPillBtn} onPress={handleBatchComplete}>
          <Text style={styles.actionPillIcon}>✓</Text>
          <Text style={styles.actionPillLabel}>Complete</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionPillBtn}
          onPress={() => setMoveCategoryModal(true)}
        >
          <Text style={styles.actionPillIcon}>→</Text>
          <Text style={styles.actionPillLabel}>Move</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionPillBtn} onPress={handleBatchImportant}>
          <Text style={styles.actionPillIcon}>★</Text>
          <Text style={styles.actionPillLabel}>Important</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionPillBtn} onPress={handleBatchDelete}>
          <Text style={styles.actionPillIcon}>🗑</Text>
          <Text style={styles.actionPillLabel}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (currentScreen === 'details') {
    return (
      <>
        {renderDetailsScreen()}
        {renderAllModals()}
      </>
    );
  }
  if (currentScreen === 'categories') {
    return (
      <>
        {renderManageCategoriesScreen()}
        {renderAllModals()}
      </>
    );
  }
  if (currentScreen === 'search') {
    return (
      <>
        {renderSearchScreen()}
        {renderAllModals()}
      </>
    );
  }
  if (['scheduled', 'backlog', 'completed'].includes(currentScreen)) {
    return (
      <>
        {renderBlockSubScreen()}
        {renderAllModals()}
      </>
    );
  }

  function renderAllModals() {
    return (
      <>
        {/* 3 Dots Menu (⋮) with One UI Scale + Opacity Animation */}
        <Modal visible={moreMenuVisible} transparent animationType="none">
          <Pressable
            style={styles.popoverBackdrop}
            onPress={() => setMoreMenuVisible(false)}
          >
            <Animated.View
              style={[
                styles.popoverMenu,
                {
                  opacity: popoverOpacityAnim,
                  transform: [{ scale: popoverScaleAnim }],
                },
              ]}
            >
              <TouchableOpacity style={styles.popoverItem} onPress={rollDailyMissions}>
                <Text style={styles.popoverText}>Roll daily quests (🎲)</Text>
              </TouchableOpacity>

              <View style={styles.dottedDivider} />

              <TouchableOpacity
                style={styles.popoverItem}
                onPress={() => {
                  setMoreMenuVisible(false);
                  configureSmoothLayout();
                  setSelectionMode(true);
                }}
              >
                <Text style={styles.popoverText}>Select</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.popoverItem}
                onPress={() => {
                  setMoreMenuVisible(false);
                  openPopover('sort');
                }}
              >
                <Text style={styles.popoverText}>Sort by</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.popoverItem}
                onPress={() => {
                  setMoreMenuVisible(false);
                  navigateToSubScreen('categories');
                }}
              >
                <Text style={styles.popoverText}>Manage categories</Text>
              </TouchableOpacity>
            </Animated.View>
          </Pressable>
        </Modal>

        {/* Sort By Submenu */}
        <Modal visible={sortMenuVisible} transparent animationType="none">
          <Pressable
            style={styles.popoverBackdrop}
            onPress={() => setSortMenuVisible(false)}
          >
            <Animated.View
              style={[
                styles.popoverMenu,
                {
                  opacity: popoverOpacityAnim,
                  transform: [{ scale: popoverScaleAnim }],
                },
              ]}
            >
              {[
                { key: 'alertTime', label: 'Alert time' },
                { key: 'dateModified', label: 'Date modified' },
                { key: 'title', label: 'Title' },
                { key: 'category', label: 'Category (custom)' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={styles.popoverItemRow}
                  onPress={() => {
                    configureSmoothLayout();
                    setSortBy(item.key);
                    setSortMenuVisible(false);
                  }}
                >
                  <Text style={styles.popoverText}>{item.label}</Text>
                  {sortBy === item.key && <Text style={styles.blueCheck}>✓</Text>}
                </TouchableOpacity>
              ))}

              <View style={styles.dottedDivider} />

              {[
                { key: 'asc', label: 'Ascending' },
                { key: 'desc', label: 'Descending' },
              ].map((ord) => (
                <TouchableOpacity
                  key={ord.key}
                  style={styles.popoverItemRow}
                  onPress={() => {
                    configureSmoothLayout();
                    setSortOrder(ord.key);
                    setSortMenuVisible(false);
                  }}
                >
                  <Text style={styles.popoverText}>{ord.label}</Text>
                  {sortOrder === ord.key && <Text style={styles.blueCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </Animated.View>
          </Pressable>
        </Modal>

        {/* Animated Bottom Sheet synchronized with Keyboard */}
        <Modal visible={sheetVisible} transparent animationType="none" onRequestClose={closeSheet}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.sheetModalContainer}
          >
            <Animated.View style={[styles.sheetBackdrop, { opacity: backdropOpacity }]}>
              <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
            </Animated.View>

            <Animated.View
              style={[
                styles.reminderBottomSheet,
                { transform: [{ translateY: sheetTranslateY }] },
              ]}
            >
              <View {...panResponder.panHandlers} style={styles.sheetHandleTouchArea}>
                <View style={styles.sheetHandle} />
              </View>

              <View style={styles.sheetTopContentArea}>
                <View style={styles.sheetInputsColumn}>
                  <TextInput
                    style={styles.sheetMainInput}
                    placeholder="Add reminder"
                    placeholderTextColor="#787882"
                    value={titleInput}
                    onChangeText={setTitleInput}
                    autoFocus
                    onFocus={() => {
                      if (activeSheetPanel !== null) {
                        configureSmoothLayout();
                        setActiveSheetPanel(null);
                      }
                    }}
                  />

                  <TextInput
                    style={styles.sheetSubDescInput}
                    placeholder="Description (optional)"
                    placeholderTextColor="#5E5E68"
                    value={descInput}
                    onChangeText={setDescInput}
                    multiline
                    onFocus={() => {
                      if (activeSheetPanel !== null) {
                        configureSmoothLayout();
                        setActiveSheetPanel(null);
                      }
                    }}
                  />

                  {/* Dynamic Checkmarks List below Description (00:21-00:33) */}
                  {checklistInput.length > 0 && (
                    <ScrollView
                      style={styles.sheetChecklistScroll}
                      keyboardShouldPersistTaps="handled"
                    >
                      {checklistInput.map((item) => {
                        const isFocused = focusedCheckId === item.id;
                        return (
                          <View key={item.id} style={styles.sheetChecklistRow}>
                            <TouchableOpacity
                              style={[
                                styles.sheetCheckCircle,
                                item.done && styles.circleCheckBeige,
                              ]}
                              onPress={() => handleToggleChecklistInSheet(item.id)}
                            >
                              {item.done && <Text style={styles.checkMarkDark}>✓</Text>}
                            </TouchableOpacity>

                            <TextInput
                              ref={(el) => {
                                checklistRefs.current[item.id] = el;
                              }}
                              style={[
                                styles.sheetChecklistInput,
                                item.done && styles.cardTitleCompleted,
                              ]}
                              placeholder="Item"
                              placeholderTextColor="#686873"
                              value={item.text}
                              onChangeText={(txt) => handleUpdateChecklistText(item.id, txt)}
                              onFocus={() => {
                                setFocusedCheckId(item.id);
                                if (activeSheetPanel !== null) {
                                  configureSmoothLayout();
                                  setActiveSheetPanel(null);
                                }
                              }}
                              onSubmitEditing={handleAddChecklistLine}
                              blurOnSubmit={false}
                            />

                            {isFocused && (
                              <TouchableOpacity
                                style={styles.removeCheckLineBtn}
                                onPress={() => handleRemoveChecklistLine(item.id)}
                              >
                                <Text style={styles.removeCheckLineIcon}>✕</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>

                <TouchableOpacity style={styles.beigeCheckBtn} onPress={handleSaveTask}>
                  <Text style={styles.beigeCheckIcon}>✓</Text>
                </TouchableOpacity>
              </View>

              {/* 5 Circular Buttons */}
              <View style={styles.circularActionsRow}>
                <TouchableOpacity
                  style={[
                    styles.circleActionBtn,
                    checklistInput.length > 0 && styles.circleActionBtnSubtleActive,
                  ]}
                  onPress={() => {
                    setActiveSheetPanel(null);
                    handleAddChecklistLine();
                  }}
                >
                  <Text style={styles.circleActionIcon}>☑</Text>
                </TouchableOpacity>

                {[
                  { id: 'schedule', icon: '📅' },
                  { id: 'weight', icon: '⚖️' },
                  { id: 'urgency', icon: '🔥' },
                  { id: 'category', icon: '☰' },
                ].map((btn) => {
                  const active = activeSheetPanel === btn.id;
                  return (
                    <TouchableOpacity
                      key={btn.id}
                      style={[
                        styles.circleActionBtn,
                        active && styles.circleActionBtnActive,
                      ]}
                      onPress={() => {
                        Keyboard.dismiss();
                        configureSmoothLayout();
                        setActiveSheetPanel(active ? null : btn.id);
                      }}
                    >
                      <Text style={styles.circleActionIcon}>{btn.icon}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Smoothly Expandable Option Panels */}
              {activeSheetPanel !== null && (
                <View style={styles.sheetExpandedArea}>
                  {activeSheetPanel === 'category' && (
                    <View>
                      <TouchableOpacity
                        style={styles.sheetListRow}
                        onPress={() => setCategoryInput('My reminders')}
                      >
                        <View style={styles.radioOuter}>
                          {categoryInput === 'My reminders' && (
                            <View style={styles.radioInner} />
                          )}
                        </View>
                        <Text
                          style={[
                            styles.detailsCatIcon,
                            { color: '#B8E986', marginRight: 12 },
                          ]}
                        >
                          ☰
                        </Text>
                        <Text style={[styles.sheetListText, { flex: 1 }]}>My reminders</Text>
                        <Text style={styles.sheetCountText}>
                          {tasks.filter((t) => !t.completed && t.category === 'My reminders').length}
                        </Text>
                      </TouchableOpacity>

                      <View style={styles.thinSheetDivider} />

                      {categories.map((cat, idx) => (
                        <TouchableOpacity
                          key={cat.id}
                          style={styles.sheetListRow}
                          onPress={() => setCategoryInput(cat.name)}
                        >
                          <View style={styles.radioOuter}>
                            {categoryInput === cat.name && <View style={styles.radioInner} />}
                          </View>
                          <View
                            style={[
                              styles.catDot,
                              { backgroundColor: cat.color, marginRight: 12 },
                            ]}
                          />
                          <Text style={[styles.sheetListText, { flex: 1 }]}>{cat.name}</Text>
                          <Text style={styles.sheetCountText}>
                            {tasks.filter((t) => !t.completed && t.category === cat.name).length}
                          </Text>
                        </TouchableOpacity>
                      ))}

                      {inlineNewCatMode ? (
                        <View style={styles.inlineCatRow}>
                          <TextInput
                            style={styles.inlineCatInput}
                            placeholder="Category name..."
                            placeholderTextColor="#787882"
                            value={inlineNewCatName}
                            onChangeText={setInlineNewCatName}
                            autoFocus
                          />
                          <TouchableOpacity
                            onPress={() => {
                              if (!inlineNewCatName.trim()) return;
                              configureSmoothLayout();
                              const name = inlineNewCatName.trim();
                              const newCat = {
                                id: Date.now().toString(),
                                name,
                                color:
                                  CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length],
                              };
                              saveCategories([...categories, newCat]);
                              setCategoryInput(name);
                              setInlineNewCatName('');
                              setInlineNewCatMode(false);
                            }}
                          >
                            <Text style={{ color: '#2CC990', fontWeight: '700' }}>Save</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.sheetListRow}
                          onPress={() => {
                            configureSmoothLayout();
                            setInlineNewCatMode(true);
                          }}
                        >
                          <Text style={styles.greenPlusIcon}>＋</Text>
                          <Text style={styles.sheetListText}>Add category</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {activeSheetPanel === 'weight' && (
                    <View>
                      <Text style={styles.panelSubLabel}>
                        Weight (Daily Roll Capacity & Focus Time):
                      </Text>
                      {[
                        { val: 1, mins: 30, label: 'Easy (1 slot • Suggests 30m)' },
                        { val: 2, mins: 90, label: 'Medium (2 slots • Suggests 1h 30m)' },
                        { val: 3, mins: 240, label: 'Hard (3 slots • Suggests 4h)' },
                      ].map((item) => (
                        <TouchableOpacity
                          key={item.val}
                          style={styles.sheetListRow}
                          onPress={() => {
                            setDifficultyInput(item.val);
                            setFocusMinutesInput(item.mins);
                          }}
                        >
                          <View style={styles.radioOuter}>
                            {difficultyInput === item.val && <View style={styles.radioInner} />}
                          </View>
                          <Text style={styles.sheetListText}>{item.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {activeSheetPanel === 'urgency' && (
                    <View>
                      <Text style={styles.panelSubLabel}>Urgency Coefficient:</Text>
                      {[
                        { val: 'low', label: 'Low (1 roll ticket)' },
                        { val: 'normal', label: 'Normal (3 roll tickets)' },
                        { val: 'high', label: 'High (6 roll tickets + Orange dot)' },
                      ].map((item) => (
                        <TouchableOpacity
                          key={item.val}
                          style={styles.sheetListRow}
                          onPress={() => setUrgencyInput(item.val)}
                        >
                          <View style={styles.radioOuter}>
                            {urgencyInput === item.val && <View style={styles.radioInner} />}
                          </View>
                          <Text style={styles.sheetListText}>{item.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {activeSheetPanel === 'schedule' && (
                    <View>
                      <Text style={styles.panelSubLabel}>
                        Deadline (3 suggestions + Custom):
                      </Text>
                      <View style={styles.chipsWrapRow}>
                        {[
                          { hrs: 3, label: 'In 3 hours' },
                          { hrs: 24, label: 'Tomorrow (24h)' },
                          { hrs: 72, label: 'In 3 days' },
                        ].map((p) => {
                          const active = !isCustomDeadline && deadlineHoursInput === p.hrs;
                          return (
                            <TouchableOpacity
                              key={String(p.hrs)}
                              style={[styles.smallChip, active && styles.smallChipActive]}
                              onPress={() => {
                                configureSmoothLayout();
                                setIsCustomDeadline(false);
                                setDeadlineHoursInput(active ? null : p.hrs);
                              }}
                            >
                              <Text style={styles.smallChipText}>{p.label}</Text>
                            </TouchableOpacity>
                          );
                        })}

                        <TouchableOpacity
                          style={[styles.smallChip, isCustomDeadline && styles.smallChipActive]}
                          onPress={() => {
                            configureSmoothLayout();
                            setIsCustomDeadline(!isCustomDeadline);
                            if (isCustomDeadline) setDeadlineHoursInput(null);
                          }}
                        >
                          <Text style={styles.smallChipText}>Custom...</Text>
                        </TouchableOpacity>
                      </View>

                      {isCustomDeadline && (
                        <View style={styles.customTimeRow}>
                          <TextInput
                            style={styles.customTimeInput}
                            placeholder="Enter time..."
                            placeholderTextColor="#787882"
                            keyboardType="numeric"
                            value={customDeadlineValue}
                            onChangeText={setCustomDeadlineValue}
                          />
                          {['hours', 'days'].map((unit) => (
                            <TouchableOpacity
                              key={unit}
                              style={[
                                styles.unitChip,
                                customDeadlineUnit === unit && styles.smallChipActive,
                              ]}
                              onPress={() => setCustomDeadlineUnit(unit)}
                            >
                              <Text style={styles.smallChipText}>{unit}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      <Text style={[styles.panelSubLabel, { marginTop: 12 }]}>
                        Repeat / Habit:
                      </Text>
                      <View style={styles.chipsWrapRow}>
                        {[
                          { type: 'none', label: "Don't repeat" },
                          { type: 'daily', label: 'Daily' },
                          { type: 'weekly', label: 'X times / week' },
                        ].map((r) => {
                          const active = recurrenceTypeInput === r.type;
                          return (
                            <TouchableOpacity
                              key={r.type}
                              style={[styles.smallChip, active && styles.smallChipActive]}
                              onPress={() => {
                                configureSmoothLayout();
                                setRecurrenceTypeInput(r.type);
                              }}
                            >
                              <Text style={styles.smallChipText}>{r.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {recurrenceTypeInput === 'weekly' && (
                        <View style={{ marginTop: 8 }}>
                          <Text style={styles.panelSubLabel}>
                            Weekly goal: {weeklyQuotaInput}x per week (Target days):
                          </Text>
                          <View style={styles.chipsWrapRow}>
                            {[1, 2, 3, 4, 5, 6].map((num) => (
                              <TouchableOpacity
                                key={num}
                                style={[
                                  styles.dayCircleBtn,
                                  weeklyQuotaInput === num && styles.smallChipActive,
                                ]}
                                onPress={() => setWeeklyQuotaInput(num)}
                              >
                                <Text style={styles.smallChipText}>{num}x</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          <View style={[styles.chipsWrapRow, { marginTop: 6 }]}>
                            {WEEK_DAYS.map((d) => {
                              const selected = targetDaysInput.includes(d.id);
                              return (
                                <TouchableOpacity
                                  key={d.id}
                                  style={[
                                    styles.dayCircleBtn,
                                    selected && styles.smallChipActive,
                                  ]}
                                  onPress={() => {
                                    if (selected) {
                                      setTargetDaysInput(
                                        targetDaysInput.filter((x) => x !== d.id)
                                      );
                                    } else {
                                      setTargetDaysInput([...targetDaysInput, d.id]);
                                    }
                                  }}
                                >
                                  <Text style={styles.smallChipText}>{d.short}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}
            </Animated.View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Batch Move to Category Modal */}
        <Modal visible={moveCategoryModal} transparent animationType="fade">
          <Pressable
            style={styles.popoverBackdrop}
            onPress={() => setMoveCategoryModal(false)}
          >
            <View style={[styles.popoverMenu, { alignSelf: 'center', marginTop: '50%' }]}>
              <Text style={[styles.panelSubLabel, { paddingHorizontal: 16 }]}>
                Move to category:
              </Text>
              <TouchableOpacity
                style={styles.popoverItem}
                onPress={() => handleBatchMoveCategory('My reminders')}
              >
                <Text style={styles.popoverText}>My reminders</Text>
              </TouchableOpacity>
              {categories.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.popoverItem}
                  onPress={() => handleBatchMoveCategory(c.name)}
                >
                  <Text style={styles.popoverText}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Modal>

        {/* Add / Edit Category Modal */}
        <Modal visible={catModalVisible} transparent animationType="fade">
          <Pressable
            style={styles.popoverBackdrop}
            onPress={() => setCatModalVisible(false)}
          >
            <Pressable style={styles.centerDialog} onPress={() => {}}>
              <Text style={styles.dialogTitle}>
                {editingCategory ? 'Edit category' : 'Add category'}
              </Text>
              <TextInput
                style={styles.dialogInput}
                placeholder="Category name"
                placeholderTextColor="#787882"
                value={catNameInput}
                onChangeText={setCatNameInput}
                autoFocus
              />
              <View style={styles.colorRow}>
                {CATEGORY_COLORS.map((col) => (
                  <TouchableOpacity
                    key={col}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: col },
                      catColorInput === col && styles.colorSwatchActive,
                    ]}
                    onPress={() => setCatColorInput(col)}
                  />
                ))}
              </View>
              <View style={styles.dialogBtnRow}>
                {editingCategory && (
                  <TouchableOpacity
                    onPress={() => handleDeleteSingleCategory(editingCategory)}
                  >
                    <Text style={{ color: '#FF453A', fontWeight: '600' }}>Delete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setCatModalVisible(false)}>
                  <Text style={{ color: '#9A9AA6', fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveCategoryModal}>
                  <Text style={{ color: '#C5A888', fontWeight: '700' }}>Done</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Doing Mode (Freeze) Timer Setup Modal */}
        <Modal visible={doingSetupModal} transparent animationType="fade">
          <Pressable
            style={styles.popoverBackdrop}
            onPress={() => setDoingSetupModal(false)}
          >
            <Pressable style={styles.centerDialog} onPress={() => {}}>
              <Text style={styles.dialogTitle}>Doing Mode (Freeze)</Text>
              <Text style={styles.panelSubLabel}>
                Choose time limit (max 24h) to lock this task on top:
              </Text>
              <View style={styles.chipsWrapRow}>
                {[
                  { mins: 30, label: '30m' },
                  { mins: 60, label: '1h' },
                  { mins: 240, label: '4h' },
                  { mins: 1440, label: '24h (Max)' },
                ].map((preset) => (
                  <TouchableOpacity
                    key={preset.mins}
                    style={styles.smallChip}
                    onPress={() => {
                      const task = tasks.find((t) => t.id === openedTaskId);
                      if (task) startDoingTask(task, preset.mins);
                    }}
                  >
                    <Text style={styles.smallChipText}>{preset.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={[styles.customTimeRow, { marginTop: 10 }]}>
                <TextInput
                  style={styles.customTimeInput}
                  placeholder="Custom minutes (1 - 1440)"
                  placeholderTextColor="#787882"
                  keyboardType="numeric"
                  value={customDoingMinutes}
                  onChangeText={setCustomDoingMinutes}
                />
                <TouchableOpacity
                  style={[styles.unitChip, styles.smallChipActive]}
                  onPress={() => {
                    const task = tasks.find((t) => t.id === openedTaskId);
                    const mins = parseInt(customDoingMinutes, 10);
                    if (task && !isNaN(mins) && mins > 0) {
                      startDoingTask(task, mins);
                    }
                  }}
                >
                  <Text style={styles.smallChipText}>Done</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  }

  // Interpolations for One UI Collapsible Viewing Area (00:34-00:39)
  const expandedHeaderHeight = scrollY.interpolate({
    inputRange: [0, 110],
    outputRange: [95, 0],
    extrapolate: 'clamp',
  });
  const expandedTitleOpacity = scrollY.interpolate({
    inputRange: [0, 65],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const compactTitleOpacity = scrollY.interpolate({
    inputRange: [50, 95],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // HOME SCREEN
  return (
    <Animated.View
      style={[
        styles.safeArea,
        { opacity: screenFadeAnim, transform: [{ translateX: screenSlideAnim }] },
      ]}
    >
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor="#0B0B12" />

        {selectionMode ? (
          <View style={styles.selectionHeader}>
            <TouchableOpacity
              style={styles.selectAllCircleWrap}
              onPress={() => {
                if (selectedTaskIds.length === mainRolledTasks.length) {
                  setSelectedTaskIds([]);
                } else {
                  setSelectedTaskIds(mainRolledTasks.map((t) => t.id));
                }
              }}
            >
              <View
                style={[
                  styles.circleCheck,
                  selectedTaskIds.length === mainRolledTasks.length &&
                    mainRolledTasks.length > 0 &&
                    styles.circleCheckBeige,
                ]}
              >
                {selectedTaskIds.length === mainRolledTasks.length &&
                  mainRolledTasks.length > 0 && <Text style={styles.checkMarkDark}>✓</Text>}
              </View>
              <Text style={styles.selectAllSmallText}>All</Text>
            </TouchableOpacity>
            <Text style={styles.selectionTitle}>Select reminders</Text>
            <TouchableOpacity
              onPress={() => {
                configureSmoothLayout();
                setSelectionMode(false);
                setSelectedTaskIds([]);
              }}
            >
              <Text style={styles.cancelTextBtn}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* One UI Expandable Viewing Area */}
            <Animated.View
              style={[
                styles.oneUiExpandedHeader,
                { height: expandedHeaderHeight, opacity: expandedTitleOpacity },
              ]}
            >
              <Text style={styles.oneUiExpandedTitle}>Reminder</Text>
            </Animated.View>

            {/* Compact Top Action Bar */}
            <View style={styles.header}>
              <Animated.Text style={[styles.headerTitle, { opacity: compactTitleOpacity }]}>
                Reminder
              </Animated.Text>
              <View style={styles.headerIconsPill}>
                <TouchableOpacity
                  onPress={() => navigateToSubScreen('search')}
                  style={styles.headerIconBtn}
                >
                  <Text style={styles.headerIconText}>🔍</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => openPopover('more')}
                  style={styles.headerIconBtn}
                >
                  <Text style={styles.headerIconText}>⋮</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        <Animated.ScrollView
          ref={mainScrollRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            {
              useNativeDriver: false,
              listener: (e) => {
                const offsetY = e.nativeEvent.contentOffset.y;
                setShowScrollTopBtn(offsetY > 180);
              },
            }
          )}
        >
          {/* Strictly 3 Top Blocks: Scheduled, Backlog, Completed */}
          <View style={styles.bentoGridThree}>
            <TouchableOpacity
              style={styles.bentoBox}
              activeOpacity={0.8}
              onPress={() => navigateToSubScreen('scheduled')}
            >
              <View style={[styles.bentoIconCircle, { backgroundColor: '#4A90E2' }]}>
                <Text style={styles.bentoEmoji}>🕒</Text>
              </View>
              <View style={styles.bentoBottomRow}>
                <Text style={styles.bentoLabel}>Scheduled</Text>
                <Text style={styles.bentoCount}>{scheduledTasks.length}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bentoBox}
              activeOpacity={0.8}
              onPress={() => navigateToSubScreen('backlog')}
            >
              <View style={[styles.bentoIconCircle, { backgroundColor: '#7B61FF' }]}>
                <Text style={styles.bentoEmoji}>☰</Text>
              </View>
              <View style={styles.bentoBottomRow}>
                <Text style={styles.bentoLabel}>Backlog</Text>
                <Text style={styles.bentoCount}>{backlogTasks.length}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bentoBox}
              activeOpacity={0.8}
              onPress={() => navigateToSubScreen('completed')}
            >
              <View style={[styles.bentoIconCircle, { backgroundColor: '#787880' }]}>
                <Text style={styles.bentoEmoji}>✓</Text>
              </View>
              <View style={styles.bentoBottomRow}>
                <Text style={styles.bentoLabel}>Completed</Text>
                <Text style={styles.bentoCount}>{completedTasks.length}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Main Area: Rolled Daily Quests */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderText}>All</Text>
              <TouchableOpacity onPress={rollDailyMissions}>
                <Text style={styles.rollLinkText}>🎲 Roll quests</Text>
              </TouchableOpacity>
            </View>

            {renderSortedTaskList(mainRolledTasks)}
          </View>
        </Animated.ScrollView>

        {/* Scroll-to-Top Floating Button (^) */}
        {showScrollTopBtn && (
          <TouchableOpacity
            style={styles.scrollTopFloatingBtn}
            onPress={() => mainScrollRef.current?.scrollTo({ y: 0, animated: true })}
          >
            <Text style={styles.scrollTopIcon}>⌃</Text>
          </TouchableOpacity>
        )}

        {selectionMode ? (
          renderBatchActionPill()
        ) : (
          <View style={styles.bottomFloatingWrapper}>
            <TouchableOpacity
              style={styles.addReminderPill}
              activeOpacity={0.85}
              onPress={openCreateSheet}
            >
              <Text style={styles.addReminderPlaceholder}>Add reminder</Text>
              <TouchableOpacity onPress={rollDailyMissions} style={styles.rollMiniBtn}>
                <Text style={{ fontSize: 16 }}>🎲</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
        )}

        {renderAllModals()}
      </SafeAreaView>
    </Animated.View>
  );
}

// Time Formatting Helpers
function formatTimeAMPM(date) {
  let hours = date.getHours();
  let minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  minutes = minutes < 10 ? '0' + minutes : minutes;
  return `${hours}:${minutes} ${ampm}`;
}

function formatCompletedDateString(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

function formatShortDate(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = String(date.getFullYear()).slice(-2);
  return `${d}/${m}/${y}`;
}

function formatRemainingTime(ms) {
  if (ms <= 0) return 'Overdue';
  const totalMins = Math.floor(ms / 60000);
  if (totalMins < 60) return `${totalMins}m left`;
  const hrs = Math.floor(totalMins / 60);
  if (hrs < 48) return `${hrs}h left`;
  return `${Math.floor(hrs / 24)}d left`;
}

function formatStopwatch(ms) {
  if (ms === null) return '00:00';
  const isNeg = ms < 0;
  const absSec = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(absSec / 3600);
  const m = Math.floor((absSec % 3600) / 60);
  const s = absSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${isNeg ? '-' : ''}${h > 0 ? pad(h) + ':' : ''}${pad(m)}:${pad(s)}`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0B12',
  },
  oneUiExpandedHeader: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
    overflow: 'hidden',
  },
  oneUiExpandedTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#EAEAEF',
    letterSpacing: -0.4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#EAEAEF',
  },
  headerIconsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16161E',
    borderRadius: 22,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#1F1F2A',
  },
  headerIconBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerIconText: {
    fontSize: 18,
    color: '#EAEAEF',
  },
  subScreenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    paddingRight: 14,
    paddingVertical: 4,
  },
  backArrow: {
    fontSize: 32,
    color: '#EAEAEF',
    fontWeight: '300',
    marginTop: -4,
  },
  subScreenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#EAEAEF',
  },
  starIcon: {
    fontSize: 24,
    color: '#EAEAEF',
  },
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  selectAllCircleWrap: {
    alignItems: 'center',
  },
  selectAllSmallText: {
    fontSize: 11,
    color: '#9A9AA6',
    marginTop: 2,
  },
  selectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#EAEAEF',
  },
  cancelTextBtn: {
    fontSize: 17,
    fontWeight: '600',
    color: '#EAEAEF',
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 130,
  },
  bentoGridThree: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  bentoBox: {
    width: '31.5%',
    backgroundColor: '#16161E',
    borderRadius: 22,
    padding: 14,
  },
  bentoIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  bentoEmoji: {
    fontSize: 13,
    color: '#FFF',
  },
  bentoBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bentoLabel: {
    fontSize: 12.5,
    color: '#9A9AA6',
    fontWeight: '500',
  },
  bentoCount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionBlock: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9A9AA6',
  },
  rollLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#C5A888',
  },
  groupSection: {
    marginBottom: 18,
  },
  groupHeaderLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9A9AA6',
    marginLeft: 8,
    marginBottom: 8,
  },
  groupedCardContainer: {
    backgroundColor: '#16161E',
    borderRadius: 24,
    overflow: 'hidden',
  },
  groupedReminderRow: {
    backgroundColor: 'transparent',
  },
  groupedRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#252530',
  },
  reminderCard: {
    backgroundColor: '#16161E',
    borderRadius: 22,
    marginBottom: 10,
    overflow: 'hidden',
  },
  reminderCardDoing: {
    borderWidth: 1,
    borderColor: '#C5A888',
  },
  reminderCardSelected: {
    backgroundColor: '#2B2B36',
  },
  cardInnerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  circleCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.8,
    borderColor: '#787885',
    marginRight: 14,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCircleCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.6,
    borderColor: '#787885',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleCheckBeige: {
    backgroundColor: '#C5B4A0',
    borderColor: '#C5B4A0',
  },
  checkMarkDark: {
    color: '#121218',
    fontSize: 12,
    fontWeight: '900',
  },
  miniCheckMarkDark: {
    color: '#121218',
    fontSize: 10,
    fontWeight: '900',
  },
  cardTextContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '500',
    color: '#F2F2F7',
  },
  cardTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#8E8E98',
  },
  orangeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#E87330',
    marginLeft: 6,
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 13.5,
    color: '#9A9AA6',
    marginTop: 5,
    lineHeight: 19,
  },
  cardChecklistContainer: {
    marginTop: 8,
  },
  cardChecklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  cardChecklistText: {
    fontSize: 14,
    color: '#D1D1D8',
  },
  cardMeta: {
    fontSize: 12.5,
    color: '#787885',
    marginTop: 6,
  },
  doingBadge: {
    backgroundColor: 'rgba(197, 168, 136, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  doingBadgeEnding: {
    backgroundColor: 'rgba(255, 69, 58, 0.18)',
  },
  doingBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C5A888',
  },
  chevronBtn: {
    paddingLeft: 10,
    paddingVertical: 2,
  },
  chevronIcon: {
    color: '#8E8E98',
    fontSize: 18,
  },
  deadlineBarTrack: {
    height: 4,
    width: '100%',
    backgroundColor: '#22222E',
  },
  deadlineBarFill: {
    height: '100%',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 38,
    backgroundColor: '#16161E',
    borderRadius: 22,
  },
  emptyTitle: {
    fontSize: 16,
    color: '#EAEAEF',
    fontWeight: '600',
  },
  emptySub: {
    fontSize: 13,
    color: '#787885',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  scrollTopFloatingBtn: {
    position: 'absolute',
    bottom: 82,
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#252530',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#363645',
  },
  scrollTopIcon: {
    fontSize: 18,
    color: '#EAEAEF',
    marginTop: 2,
  },
  bottomFloatingWrapper: {
    position: 'absolute',
    bottom: 18,
    left: 20,
    right: 20,
  },
  addReminderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1E26',
    borderRadius: 30,
    paddingLeft: 22,
    paddingRight: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#2B2B36',
  },
  addReminderPlaceholder: {
    fontSize: 16,
    color: '#8E8E98',
  },
  rollMiniBtn: {
    paddingHorizontal: 8,
  },
  micIcon: {
    fontSize: 16,
    color: '#EAEAEF',
    marginRight: 6,
  },
  detailsMainCard: {
    backgroundColor: '#16161E',
    borderRadius: 26,
    padding: 22,
    marginHorizontal: 8,
    marginTop: 8,
  },
  detailsTitleText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '500',
    marginBottom: 8,
  },
  detailsDescText: {
    fontSize: 15,
    color: '#B0B0B8',
    marginBottom: 12,
    lineHeight: 22,
  },
  detailsDivider: {
    height: 1,
    backgroundColor: '#262630',
    marginVertical: 14,
  },
  detailsCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailsCatIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  detailsCatName: {
    fontSize: 17,
    color: '#EAEAEF',
  },
  detailsMetaTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },
  detailsMetaTagText: {
    fontSize: 12.5,
    color: '#8E8E98',
    marginRight: 8,
  },
  createdDateLabel: {
    fontSize: 13,
    color: '#9A9AA6',
    alignSelf: 'flex-end',
    marginRight: 24,
    marginTop: 14,
  },
  bottomActionPillWrapper: {
    position: 'absolute',
    bottom: 20,
    left: 28,
    right: 28,
  },
  bottomActionPill: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#1E1E26',
    borderRadius: 32,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#2B2B36',
  },
  actionPillBtn: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  actionPillIcon: {
    fontSize: 18,
    color: '#EAEAEF',
    marginBottom: 3,
  },
  actionPillLabel: {
    fontSize: 11.5,
    color: '#B0B0B8',
  },
  sheetModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  reminderBottomSheet: {
    backgroundColor: '#222228',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 22,
  },
  sheetHandleTouchArea: {
    paddingTop: 12,
    paddingBottom: 14,
    alignItems: 'center',
  },
  sheetHandle: {
    width: 42,
    height: 4.5,
    backgroundColor: '#686872',
    borderRadius: 3,
  },
  sheetTopContentArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetInputsColumn: {
    flex: 1,
  },
  sheetMainInput: {
    fontSize: 19,
    color: '#FFFFFF',
    paddingVertical: 4,
  },
  sheetSubDescInput: {
    fontSize: 14.5,
    color: '#B0B0B8',
    paddingVertical: 4,
    marginTop: 2,
  },
  sheetChecklistScroll: {
    maxHeight: 160,
    marginTop: 6,
  },
  sheetChecklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingLeft: 4,
  },
  sheetCheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.8,
    borderColor: '#787885',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetChecklistInput: {
    flex: 1,
    fontSize: 16,
    color: '#F2F2F7',
    paddingVertical: 2,
  },
  removeCheckLineBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.4,
    borderColor: '#B0B0B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  removeCheckLineIcon: {
    fontSize: 11,
    color: '#B0B0B8',
    fontWeight: '700',
  },
  beigeCheckBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#C5B4A0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    marginBottom: 2,
  },
  beigeCheckIcon: {
    fontSize: 18,
    color: '#18181E',
    fontWeight: '900',
  },
  circularActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  circleActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#33333C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleActionBtnActive: {
    backgroundColor: '#8C8275',
  },
  circleActionBtnSubtleActive: {
    borderWidth: 1.5,
    borderColor: '#C5B4A0',
  },
  circleActionIcon: {
    fontSize: 18,
    color: '#FFF',
  },
  sheetExpandedArea: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#303038',
  },
  panelSubLabel: {
    fontSize: 12.5,
    color: '#9A9AA6',
    marginBottom: 8,
  },
  sheetListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
  },
  thinSheetDivider: {
    height: 1,
    backgroundColor: '#303038',
    marginLeft: 36,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#C5A888',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#C5A888',
  },
  sheetListText: {
    fontSize: 16,
    color: '#EAEAEF',
  },
  sheetCountText: {
    fontSize: 14,
    color: '#8E8E98',
  },
  greenPlusIcon: {
    fontSize: 20,
    color: '#2CC990',
    marginRight: 14,
    fontWeight: '600',
  },
  greenPlusBig: {
    fontSize: 22,
    color: '#2CC990',
    marginRight: 14,
  },
  inlineCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  inlineCatInput: {
    flex: 1,
    color: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#555',
    marginRight: 12,
    paddingVertical: 4,
  },
  catDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  catDotLarge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 14,
  },
  popoverBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  popoverMenu: {
    alignSelf: 'flex-end',
    marginTop: 52,
    marginRight: 16,
    backgroundColor: '#222228',
    borderRadius: 24,
    paddingVertical: 10,
    minWidth: 220,
  },
  popoverItem: {
    paddingVertical: 13,
    paddingHorizontal: 22,
  },
  popoverItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 22,
  },
  popoverText: {
    fontSize: 16,
    color: '#F2F2F7',
  },
  blueCheck: {
    fontSize: 16,
    color: '#5C95FF',
    fontWeight: '700',
  },
  dottedDivider: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#444450',
    marginVertical: 4,
    marginHorizontal: 18,
  },
  searchFiltersCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#16161E',
    borderRadius: 22,
    padding: 14,
  },
  filterPillOutline: {
    borderWidth: 1,
    borderColor: '#484854',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  filterPillActive: {
    backgroundColor: '#383846',
    borderColor: '#C5A888',
  },
  filterPillText: {
    fontSize: 14,
    color: '#D1D1D8',
  },
  searchBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E26',
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  searchBottomInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
  },
  chipsWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  smallChip: {
    backgroundColor: '#33333C',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  smallChipActive: {
    backgroundColor: '#8C8275',
  },
  smallChipText: {
    fontSize: 13,
    color: '#FFF',
    fontWeight: '500',
  },
  customTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  customTimeInput: {
    flex: 1,
    backgroundColor: '#191920',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    color: '#FFF',
    fontSize: 14,
    marginRight: 8,
  },
  unitChip: {
    backgroundColor: '#33333C',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    marginLeft: 4,
  },
  dayCircleBtn: {
    width: 40,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#33333C',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    marginBottom: 6,
  },
  centerDialog: {
    backgroundColor: '#222228',
    borderRadius: 26,
    padding: 22,
    marginHorizontal: 28,
    marginTop: '45%',
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 14,
  },
  dialogInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#686873',
    color: '#FFF',
    fontSize: 16,
    paddingVertical: 8,
    marginBottom: 16,
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  colorSwatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  colorSwatchActive: {
    borderWidth: 3,
    borderColor: '#FFF',
  },
  dialogBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
  },
});