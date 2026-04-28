/**
 * Check if an event is a quiz, test, or exam
 * Excludes "self check quiz" and similar non-important quizzes
 */
export function isImportantAssessment(title: string): boolean {
  const lowerTitle = title.toLowerCase();
  
  // Exclude self-check quizzes
  if (lowerTitle.includes('self check')) {
    return false;
  }
  
  // Check for quiz, test, or exam (case insensitive)
  const hasQuiz = lowerTitle.includes('quiz');
  const hasTest = lowerTitle.includes('test');
  const hasExam = lowerTitle.includes('exam');
  
  return hasQuiz || hasTest || hasExam;
}

