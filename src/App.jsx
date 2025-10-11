import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import "./App.css";
import {COUNTIES} from "./counties";
import mapSvg from "./assets/counties.svg?raw";

const STORAGE_KEY = "county-quiz-stats-v1";
const COUNTY_SET = new Set(COUNTIES);
const TOTAL_COUNTIES = COUNTIES.length;

const defaultStats = {seen: 0, correct: 0, wrong: 0};

const ensureStats = (stats, county) => {
    return stats[county] ?? {...defaultStats};
};

const loadStats = () => {
    if (typeof window === "undefined") {
        return {};
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === "object") ? parsed : {};
    } catch {
        return {};
    }
};

const persistStats = (stats) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
};

const weightForCounty = (stats, county, previous) => {
    const entry = ensureStats(stats, county);
    const attempts = entry.correct + entry.wrong;
    const seen = entry.seen;
    if (attempts === 0) {
        return 6.5;
    }
    const missRate = entry.wrong / attempts;
    const freshnessBoost = 1 / (seen + 1);
    let weight = 1 + missRate * 4 + freshnessBoost;
    if (seen === 0) {
        weight += 0.4;
    }
    if (previous && county === previous) {
        weight *= 0.6;
    }
    return weight;
};

const pickNextCounty = (stats, previous) => {
    const weighted = COUNTIES.map((county) => ({
        county,
        weight: weightForCounty(stats, county, previous),
    }));
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    let threshold = Math.random() * totalWeight;
    for (const {county, weight} of weighted) {
        threshold -= weight;
        if (threshold <= 0) {
            return county;
        }
    }
    return weighted[weighted.length - 1].county;
};

const applyNextCounty = (stats, nextCounty) => {
    const nextEntry = ensureStats(stats, nextCounty);
    const statsWithSeen = {
        ...stats,
        [nextCounty]: {
            ...nextEntry,
            seen: nextEntry.seen + 1,
        },
    };
    persistStats(statsWithSeen);
    return {stats: statsWithSeen, currentCounty: nextCounty};
};

const advanceCounty = (stats, previousCounty) => {
    const nextCounty = pickNextCounty(stats, previousCounty);
    return applyNextCounty(stats, nextCounty);
};

const shuffle = (values) => {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        const holder = copy[index];
        copy[index] = copy[swapIndex];
        copy[swapIndex] = holder;
    }
    return copy;
};

const formatDuration = (ms) => {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) {
        return `${seconds}s`;
    }
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
};

const TEST_MESSAGES = [
    {
        threshold: 100,
        messages: [
            "You’re flawless!",
            "Absolute county wizard!",
            "Every county bows to you.",
            "Perfection achieved. Frame this moment.",
            "Cartographic superstar!",
            "Nothing left to teach you—take a bow.",
        ],
    },
    {
        threshold: 95,
        messages: [
            "Sublime geography skills!",
            "Nearly perfect—bragging rights earned.",
            "Counties fear your insight.",
            "So close to perfect—brilliant work!",
            "County encyclopedia unlocked.",
            "If this were darts, you’d be on a nine-darter.",
        ],
    },
    {
        threshold: 85,
        messages: [
            "Great job!",
            "The counties are proud of you.",
            "You’re on a roll—keep going!",
            "A+ on the atlas quiz!",
            "County compass pointing true north.",
            "Bring this energy to the next round.",
        ],
    },
    {
        threshold: 70,
        messages: [
            "Solid work!",
            "Nice effort—one more round?",
            "County compass mostly on point.",
            "You’re warming up the map nicely.",
            "Stick with it—victory is circling.",
            "Momentum is on your side.",
        ],
    },
    {
        threshold: 50,
        messages: [
            "Room to grow, but you’re getting there!",
            "Counties are tricky—keep practicing!",
            "Not bad—ready for a rematch?",
            "Your map sense is waking up.",
            "Give it another spin—progress incoming.",
            "You’re halfway to hero status.",
        ],
    },
    {
        threshold: 0,
        messages: [
            "Tough run—give it another go!",
            "Counties can be stubborn—try again!",
            "Every miss is a step closer to mastery.",
            "Maps are tricky—today was recon.",
            "Shake it off—next run will sparkle.",
            "The counties won this round—demand a rematch.",
        ],
    },
];

const pickTestMessage = (percent) => {
    for (const bucket of TEST_MESSAGES) {
        if (percent >= bucket.threshold) {
            const rotations = shuffle(bucket.messages);
            return rotations[0];
        }
    }
    return "Great effort!";
};


const createInitialState = () => {
    const baseStats = loadStats();
    return advanceCounty(baseStats, null);
};

function App() {
    const [state, setState] = useState(() => createInitialState());
    const {stats, currentCounty} = state;
    const [feedback, setFeedback] = useState("");
    const [feedbackType, setFeedbackType] = useState(null);
    const [selectedCountyName, setSelectedCountyName] = useState("");
    const svgRef = useRef(null);
    const [isRevealed, setIsRevealed] = useState(false);
    const revealedRef = useRef(null);
    const [isStatsOpen, setIsStatsOpen] = useState(false);
    const statsHistoryFlag = useRef(false);
    const isStatsOpenRef = useRef(false);
    const [isTestMode, setIsTestMode] = useState(false);
    const [testQueue, setTestQueue] = useState([]);
    const [testCorrect, setTestCorrect] = useState(0);
    const [testStartTime, setTestStartTime] = useState(null);
    const [testResult, setTestResult] = useState(null);
    const testCorrectRef = useRef(0);
    const actionButtonRef = useRef(null);

    useEffect(() => {
        testCorrectRef.current = testCorrect;
    }, [testCorrect]);

    useEffect(() => {
        const container = svgRef.current;
        if (!container) return;
        if (container.childElementCount === 0) {
            container.innerHTML = mapSvg;
        }
    }, []);

    const testQueueLength = testQueue.length;
    const completedTestCount = TOTAL_COUNTIES - testQueueLength;
    const rawTestProgress = (isTestMode && TOTAL_COUNTIES > 0)
        ? Math.round((completedTestCount / TOTAL_COUNTIES) * 100)
        : 0;
    const testProgressPercent = Math.min(100, Math.max(0, rawTestProgress));
    const testButtonLabel = isTestMode ? "Cancel" : "Test me";
    const testMessage = useMemo(() => {
        if (!testResult) return "";
        return pickTestMessage(testResult.percent);
    }, [testResult]);
    const testScoreLabel = testResult ? `${testResult.correct} / ${testResult.total}` : "";
    const testDurationLabel = testResult ? formatDuration(testResult.durationMs) : "";

    const feedbackNode = feedback
        ? (
            <p className={`app__feedback${feedbackType ? ` app__feedback--${feedbackType}` : ""}`}>
                {feedback}
            </p>
        )
        : null;
    const headerMessageContent = isRevealed
        ? (selectedCountyName
            ? <span className="app__header-label">{selectedCountyName}</span>
            : feedbackNode)
        : feedbackNode;

    const clearHighlights = useCallback(() => {
        const container = svgRef.current;
        if (!container) return;
        container
            .querySelectorAll(".is-selected, .is-last-clicked, .is-revealed")
            .forEach((node) =>
                node.classList.remove("is-selected", "is-last-clicked", "is-revealed"),
            );
        const revealed = revealedRef.current;
        if (revealed?.node?.isConnected) {
            if (revealed.originalStyle != null) {
                if (revealed.originalStyle.length > 0) {
                    revealed.node.setAttribute("style", revealed.originalStyle);
                } else {
                    revealed.node.removeAttribute("style");
                }
            }
        }
        revealedRef.current = null;
    }, []);

    const focusActionButton = useCallback(() => {
        const node = actionButtonRef.current;
        if (!node) return;
        node.focus();
    }, []);

    const finishTest = useCallback((finalCorrect, options = {}) => {
        const {skipAdvance = false} = options;
        const durationMs = testStartTime ? Date.now() - testStartTime : 0;
        clearHighlights();
        setIsTestMode(false);
        setTestQueue([]);
        setTestStartTime(null);
        testCorrectRef.current = finalCorrect;
        setTestCorrect(finalCorrect);
        const percent = TOTAL_COUNTIES === 0 ? 0 : Math.round((finalCorrect / TOTAL_COUNTIES) * 100);
        setTestResult({
            correct: finalCorrect,
            total: TOTAL_COUNTIES,
            percent,
            durationMs,
        });
        setIsRevealed(false);
        setFeedback("");
        setFeedbackType(null);
        setSelectedCountyName("");
        if (!skipAdvance) {
            setState((prev) => advanceCounty(prev.stats, prev.currentCounty));
        }
    }, [clearHighlights, testStartTime]);

    const handleCorrect = useCallback(
        (county) => {
            setState((prev) => {
                const countyStats = ensureStats(prev.stats, county);
                const updatedStats = {
                    ...prev.stats,
                    [county]: {
                        ...countyStats,
                        correct: countyStats.correct + 1,
                    },
                };
                persistStats(updatedStats);
                return {stats: updatedStats, currentCounty: prev.currentCounty};
            });
            if (isTestMode) {
                const nextCorrect = testCorrectRef.current + 1;
                testCorrectRef.current = nextCorrect;
                setTestCorrect(nextCorrect);
                if (testQueueLength <= 1) {
                    finishTest(nextCorrect);
                    return;
                }
            }
            setFeedback("Correct!");
            setFeedbackType("success");
            setIsRevealed(true);
        },
        [finishTest, isTestMode, testQueueLength],
    );

    const handleIncorrect = useCallback(
        (county, guess) => {
            setState((prev) => {
                const countyStats = ensureStats(prev.stats, county);
                const updatedStats = {
                    ...prev.stats,
                    [county]: {
                        ...countyStats,
                        wrong: countyStats.wrong + 1,
                    },
                };
                persistStats(updatedStats);
                return {stats: updatedStats, currentCounty: prev.currentCounty};
            });
            if (isTestMode && testQueueLength <= 1) {
                finishTest(testCorrectRef.current);
                return;
            }
            setFeedback(`That was ${guess}. Try again.`);
            setFeedbackType("error");
            setIsRevealed(false);
        },
        [finishTest, isTestMode, testQueueLength],
    );

    const getCountyPath = useCallback((county) => {
        if (!county) return null;
        const container = svgRef.current;
        if (!container) return null;
        const escape = typeof CSS !== "undefined" && typeof CSS.escape === "function"
            ? CSS.escape
            : (value) => value.replace(/["\\]/g, "\\$&");
        const node = container.querySelector(`[id="${escape(county)}"]`);
        if (!node) {
            console.warn(`[map] County path not found for id: ${county}`);
        }
        return node;
    }, []);

    const startTestMode = useCallback(() => {
        const order = shuffle(COUNTIES);
        if (order.length === 0) return;
        clearHighlights();
        if (isStatsOpenRef.current) {
            statsHistoryFlag.current = false;
            setIsStatsOpen(false);
        }
        setIsTestMode(true);
        setTestQueue(order);
        testCorrectRef.current = 0;
        setTestCorrect(0);
        setTestStartTime(Date.now());
        setTestResult(null);
        setSelectedCountyName("");
        setFeedback("");
        setFeedbackType(null);
        setIsRevealed(false);
        setState((prev) => applyNextCounty(prev.stats, order[0]));
    }, [clearHighlights]);

    const cancelTestMode = useCallback(() => {
        clearHighlights();
        setIsTestMode(false);
        setTestQueue([]);
        testCorrectRef.current = 0;
        setTestCorrect(0);
        setTestStartTime(null);
        setTestResult(null);
        setSelectedCountyName("");
        setFeedback("");
        setFeedbackType(null);
        setIsRevealed(false);
        setState((prev) => advanceCounty(prev.stats, prev.currentCounty));
    }, [clearHighlights]);

    const handleTestButton = useCallback(() => {
        if (isTestMode) {
            cancelTestMode();
        } else {
            startTestMode();
        }
    }, [cancelTestMode, isTestMode, startTestMode]);

    const closeTestResult = useCallback(() => {
        setTestResult(null);
        testCorrectRef.current = 0;
        setTestCorrect(0);
        setTestQueue([]);
        setTestStartTime(null);
        setSelectedCountyName("");
    }, []);

    const openStats = useCallback(() => {
        if (isStatsOpenRef.current) return;
        if (typeof window !== "undefined") {
            statsHistoryFlag.current = true;
            window.history.pushState({modal: "stats"}, "");
        } else {
            statsHistoryFlag.current = false;
        }
        setIsStatsOpen(true);
    }, []);

    const closeStats = useCallback(
        (options = {}) => {
            const {skipHistory = false} = options;
            if (!isStatsOpenRef.current) return;
            setIsStatsOpen(false);
            if (!skipHistory && statsHistoryFlag.current && typeof window !== "undefined") {
                statsHistoryFlag.current = false;
                window.history.back();
            }
        },
        [],
    );

    useEffect(() => {
        isStatsOpenRef.current = isStatsOpen;
    }, [isStatsOpen]);

    useEffect(() => {
        if (typeof window === "undefined") return undefined;
        const handlePop = () => {
            if (isStatsOpenRef.current) {
                statsHistoryFlag.current = false;
                closeStats({skipHistory: true});
            }
        };
        window.addEventListener("popstate", handlePop);
        return () => {
            window.removeEventListener("popstate", handlePop);
        };
    }, [closeStats]);

    useEffect(() => {
        if (!isStatsOpen) return undefined;
        if (typeof document === "undefined") return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isStatsOpen]);


    const handleMapClick = useCallback(
    (event) => {
        const path = event.target.closest("path");
        if (!path) return;
        const guess = path.id;
        if (!COUNTY_SET.has(guess)) return;
        focusActionButton();
        if (isRevealed) {
            const container = svgRef.current;
            if (container) {
                container.querySelectorAll(".is-last-clicked").forEach((node) => {
                    node.classList.remove("is-last-clicked");
                });
            }
            if (guess === currentCounty) {
                setSelectedCountyName("");
            } else {
                setSelectedCountyName(guess);
            }
            path.classList.add("is-last-clicked");
            return;
        }
        clearHighlights();
        path.classList.add("is-last-clicked");
        if (!currentCounty) return;
        if (guess === currentCounty) {
            setSelectedCountyName("");
            path.classList.remove("is-last-clicked");
            path.classList.add("is-selected");
            handleCorrect(currentCounty);
        } else {
            setSelectedCountyName("");
            handleIncorrect(currentCounty, guess);
        }
    },
    [clearHighlights, currentCounty, focusActionButton, handleCorrect, handleIncorrect, isRevealed],
    );

    useEffect(() => {
        clearHighlights();
        setIsRevealed(false);
        setFeedback("");
        setFeedbackType(null);
        setSelectedCountyName("");
    }, [clearHighlights, currentCounty]);

    const handleShowOrNext = useCallback(() => {
        if (!currentCounty) return;
        if (isRevealed) {
            clearHighlights();
            if (isTestMode) {
                if (testQueueLength <= 1) {
                    finishTest(testCorrectRef.current);
                } else {
                    const remaining = testQueue.slice(1);
                    const nextCounty = remaining[0];
                    setTestQueue(remaining);
                    setState((prev) => applyNextCounty(prev.stats, nextCounty));
                    setIsRevealed(false);
                    setFeedback("");
                    setFeedbackType(null);
                    setSelectedCountyName("");
                }
                return;
            }
            setState((prev) => advanceCounty(prev.stats, prev.currentCounty));
            setIsRevealed(false);
            setFeedback("");
            setFeedbackType(null);
            setSelectedCountyName("");
            return;
        }
        setState((prev) => {
            const currentStats = ensureStats(prev.stats, currentCounty);
            const updatedStats = {
                ...prev.stats,
                [currentCounty]: {
                    ...currentStats,
                    wrong: currentStats.wrong + 1,
                },
            };
            persistStats(updatedStats);
            return {stats: updatedStats, currentCounty: prev.currentCounty};
        });
        clearHighlights();
        setFeedback("");
        setFeedbackType(null);
        const target = getCountyPath(currentCounty);
        if (target) {
            const originalStyle = target.getAttribute("style") ?? "";
            revealedRef.current = {node: target, originalStyle};
            const styleMap = originalStyle
                .split(";")
                .map((segment) => segment.trim())
                .filter(Boolean)
                .reduce((acc, segment) => {
                    const [key, value] = segment.split(":");
                    if (key && value) {
                        acc[key.trim()] = value.trim();
                    }
                    return acc;
                }, {});
            styleMap.fill = "#e91e63";
            styleMap.stroke = "#880e4f";
            styleMap["stroke-width"] = "1.6";
            const nextStyle = Object.entries(styleMap)
                .map(([key, value]) => `${key}:${value}`)
                .join(";");
            target.setAttribute("style", nextStyle);
            target.classList.add("is-revealed");
            console.debug(`[map] Revealed ${currentCounty}`);
            setSelectedCountyName("");
            setIsRevealed(true);
        }
    }, [clearHighlights, currentCounty, finishTest, getCountyPath, isRevealed, isTestMode, testQueue, testQueueLength]);

    const statsEntries = useMemo(() => {
        return [...COUNTIES]
            .sort((a, b) => a.localeCompare(b))
            .map((county) => {
                const entry = ensureStats(stats, county);
                const attempts = entry.correct + entry.wrong;
                const percent = attempts === 0 ? 0 : Math.round((entry.correct / attempts) * 100);
                return {
                    county,
                    percent,
                    attempts,
                    correct: entry.correct,
                    seen: entry.seen,
                };
            });
    }, [stats]);


    return (
        <div className={`app${isTestMode ? " app--test" : ""}`}>
            {isTestMode && (
                <div className="test-progress" role="status" aria-live="polite">
                    <div className="test-progress__bar">
                        <div className="test-progress__fill" style={{width: `${testProgressPercent}%`}}/>
                        <div className="test-progress__label">{`${testProgressPercent}% complete`}</div>
                    </div>
                </div>
            )}
            <header className="app__header">
                <div className="app__header-top">
                    <h1 className="app__title">Where is {currentCounty}?</h1>
                </div>
                <div className="app__header-message" aria-live="polite">
                    {headerMessageContent}
                </div>
            </header>
            <main className="app__main">
                <div className="map-container">
                    <div ref={svgRef} className="map" onClick={handleMapClick}/>
                </div>
            </main>
            <footer className="app__footer">
                <button type="button" className="footer-button footer-button--stats" onClick={openStats}>
                    Stats
                </button>
                <button type="button" className="footer-button footer-button--test" onClick={handleTestButton}>
                    {testButtonLabel}
                </button>
                <button
                    ref={actionButtonRef}
                    type="button"
                    className="footer-button footer-button--action"
                    onClick={handleShowOrNext}
                >
                    {isRevealed ? "Next" : "Show"}
                </button>
            </footer>
            {testResult && (
                <div
                    className="stats-overlay test-result-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="test-result-title"
                    aria-describedby="test-result-message"
                    onClick={closeTestResult}
                >
                    <div className="test-modal" onClick={(event) => event.stopPropagation()}>
                        <button type="button" className="test-modal__close" aria-label="Close test results" onClick={closeTestResult}>
                            ×
                        </button>
                        <div className="test-modal__icon" aria-hidden="true">🎉</div>
                        <h2 id="test-result-title" className="test-modal__title">Test complete!</h2>
                        <p className="test-modal__score">{testScoreLabel}</p>
                        <p className="test-modal__percent">{testResult.percent}% correct</p>
                        <p id="test-result-message" className="test-modal__message">{testMessage}</p>
                        <p className="test-modal__meta">Time: {testDurationLabel}</p>
                        <div className="test-modal__actions">
                            <button type="button" className="test-modal__button" onClick={closeTestResult}>
                                Close
                            </button>
                            <button type="button" className="test-modal__button test-modal__button--secondary" onClick={() => {
                                closeTestResult();
                                startTestMode();
                            }}>
                                Test again
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isStatsOpen && (
                <div className="stats-overlay" role="dialog" aria-modal="true" aria-labelledby="stats-title" onClick={() => closeStats()}>
                    <div className="stats-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="stats-header">
                            <h2 id="stats-title">County Stats</h2>
                            <button
                                type="button"
                                className="stats-close"
                                aria-label="Close stats"
                                onClick={() => closeStats()}
                            >
                                ×
                            </button>
                        </div>
                        <div className="stats-body">
                            <div className="stats-grid">
                                {statsEntries.map(({county, percent, attempts, correct, seen}) => {
                                    const isUnseen = seen === 0;
                                    return (
                                        <div className="stats-row" key={county}>
                                            <div className="stats-name">{county}</div>
                                            <div className="stats-bar" aria-hidden="true">
                                                <div
                                                    className={`stats-bar-fill${isUnseen ? " stats-bar-fill--unseen" : ""}`}
                                                    style={{width: `${percent}%`}}
                                                />
                                            </div>
                                            <div className="stats-data">
                                                {percent}% ({correct}/{attempts})
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
