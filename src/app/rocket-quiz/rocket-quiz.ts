import { Component, signal, HostBinding, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

interface QuizQuestion {
  id: number;
  section: string;
  sectionLetter: string;
  question: string;
  type: 'scale' | 'frequency' | 'yesno' | 'time' | 'text';
  options?: string[];
}

interface QuizAnswer {
  questionId: number;
  value: string | number;
}

@Component({
  selector: 'app-rocket-quiz',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './rocket-quiz.html',
  styleUrl: './rocket-quiz.css',
})
export class RocketQuiz implements OnInit {
  protected authService = inject(AuthService);
  private router = inject(Router);
  currentStep = signal(0); // 0 = intro, 1-15 = questions, 16 = results
  answers = signal<QuizAnswer[]>([]);
  currentAnswer = signal<string | number>('');
  showResults = signal(false);
  email = signal('');
  name = signal('');
  password = signal('');
  authMode = signal<'signup' | 'login'>('signup');
  isLightMode = signal(true);

  @HostBinding('class.light-mode') get lightMode() {
    return this.isLightMode();
  }

  @HostBinding('class.dark-mode') get darkMode() {
    return !this.isLightMode();
  }

  ngOnInit() {
    // Detect system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.isLightMode.set(false);
    }
  }

  toggleTheme() {
    this.isLightMode.update(current => !current);
  }

  questions: QuizQuestion[] = [
    // Section 1: R – Remember Your Future Self
    {
      id: 1,
      section: 'Remember Your Future Self',
      sectionLetter: 'R',
      question: 'On a scale of 1–10, how clearly can you visualize your Future Self living your ideal life?',
      type: 'scale'
    },
    {
      id: 2,
      section: 'Remember Your Future Self',
      sectionLetter: 'R',
      question: 'How often do you take time to emotionally connect with your long-term goals?',
      type: 'frequency',
      options: ['Daily', 'Weekly', 'Monthly', 'Rarely', 'Never']
    },

    // Section 2: O – Own Your ONE Thing
    {
      id: 3,
      section: 'Own Your ONE Thing',
      sectionLetter: 'O',
      question: 'Do you currently know your ONE most important goal or outcome to focus on right now?',
      type: 'yesno',
      options: ['Yes, very clear', 'Somewhat', 'Not really', 'No']
    },
    {
      id: 4,
      section: 'Own Your ONE Thing',
      sectionLetter: 'O',
      question: 'How much time daily do you devote to your ONE thing, without distractions?',
      type: 'time',
      options: ['0-30 minutes', '30-60 minutes', '1-2 hours', '2-4 hours', '4+ hours']
    },

    // Section 3: C – Celebrate Change
    {
      id: 5,
      section: 'Celebrate Change',
      sectionLetter: 'C',
      question: 'How often do you recognize and celebrate small wins, even before the big goal is reached?',
      type: 'frequency',
      options: ['Always', 'Often', 'Sometimes', 'Rarely', 'Never']
    },
    {
      id: 6,
      section: 'Celebrate Change',
      sectionLetter: 'C',
      question: 'When challenges arise, do you see them as obstacles or signals of growth?',
      type: 'yesno',
      options: ['Signals of growth', 'Mix of both', 'Mostly obstacles', 'Always obstacles']
    },

    // Section 4: K – Keep Kind Intentions
    {
      id: 7,
      section: 'Keep Kind Intentions',
      sectionLetter: 'K',
      question: 'How would you rate your level of self-compassion when you fall short or miss a target?',
      type: 'scale'
    },
    {
      id: 8,
      section: 'Keep Kind Intentions',
      sectionLetter: 'K',
      question: 'Do you have tools or rituals that help you bounce back from emotional setbacks?',
      type: 'yesno',
      options: ['Yes, multiple', 'Yes, one or two', 'Working on it', 'No, not really']
    },

    // Section 5: E – Engage with Exponential Effort
    {
      id: 9,
      section: 'Engage with Exponential Effort',
      sectionLetter: 'E',
      question: 'How consistent are you at showing up daily—even when motivation is low?',
      type: 'scale'
    },
    {
      id: 10,
      section: 'Engage with Exponential Effort',
      sectionLetter: 'E',
      question: 'Are you pushing your limits or playing within your comfort zone most days?',
      type: 'yesno',
      options: ['Pushing limits', 'Mostly pushing', 'Comfort zone', 'Deep in comfort zone']
    },

    // Section 6: T – Transform Time with Your Team
    {
      id: 11,
      section: 'Transform Time with Your Team',
      sectionLetter: 'T',
      question: 'Do you currently have an accountability partner, mentor, or supportive team helping you grow?',
      type: 'yesno',
      options: ['Yes, active support', 'Yes, but passive', 'Looking for one', 'No']
    },
    {
      id: 12,
      section: 'Transform Time with Your Team',
      sectionLetter: 'T',
      question: 'How often do you collaborate with others to accelerate your goals?',
      type: 'frequency',
      options: ['Daily', 'Weekly', 'Monthly', 'Occasionally', 'Never']
    },

    // Section 7: Momentum & Next Steps
    {
      id: 13,
      section: 'Momentum & Next Steps',
      sectionLetter: 'M',
      question: 'What\'s the #1 frustration that\'s been holding you back from achieving your biggest goal?',
      type: 'text'
    },
    {
      id: 14,
      section: 'Momentum & Next Steps',
      sectionLetter: 'M',
      question: 'What would it mean to you—personally and professionally—to overcome that?',
      type: 'text'
    },
    {
      id: 15,
      section: 'Momentum & Next Steps',
      sectionLetter: 'M',
      question: 'Anything else we should know?',
      type: 'text'
    }
  ];

  get currentQuestion(): QuizQuestion | null {
    if (this.currentStep() === 0 || this.currentStep() > 15) return null;
    return this.questions[this.currentStep() - 1];
  }

  get progressPercentage(): number {
    return Math.round((this.currentStep() / 15) * 100);
  }

  startQuiz() {
    this.currentStep.set(1);
  }

  nextQuestion() {
    const question = this.currentQuestion;
    if (!question) return;

    // Save answer
    const existingIndex = this.answers().findIndex(a => a.questionId === question.id);
    const answer: QuizAnswer = {
      questionId: question.id,
      value: this.currentAnswer()
    };

    if (existingIndex >= 0) {
      const newAnswers = [...this.answers()];
      newAnswers[existingIndex] = answer;
      this.answers.set(newAnswers);
    } else {
      this.answers.set([...this.answers(), answer]);
    }

    // Move to next
    if (this.currentStep() < 15) {
      this.currentStep.update(s => s + 1);
      this.currentAnswer.set('');
      // Load existing answer if any
      const existingAnswer = this.answers().find(a => a.questionId === this.questions[this.currentStep() - 1].id);
      if (existingAnswer) {
        this.currentAnswer.set(existingAnswer.value);
      }
    } else {
      this.showResults.set(true);
      this.currentStep.set(16);
    }
  }

  previousQuestion() {
    if (this.currentStep() > 1) {
      this.currentStep.update(s => s - 1);
      // Load answer for previous question
      const existingAnswer = this.answers().find(a => a.questionId === this.questions[this.currentStep() - 1].id);
      if (existingAnswer) {
        this.currentAnswer.set(existingAnswer.value);
      } else {
        this.currentAnswer.set('');
      }
    }
  }

  canProceed(): boolean {
    const answer = this.currentAnswer();
    return answer !== '' && answer !== null && answer !== undefined;
  }

  setAuthMode(mode: 'signup' | 'login') {
    this.authMode.set(mode);
  }

  canSubmitResults(): boolean {
    const email = this.email().trim();
    const password = this.password();
    if (!email || !password) {
      return false;
    }
    if (this.authMode() === 'signup') {
      return !!this.name().trim();
    }
    return true;
  }

  async submitQuiz() {
    if (!this.canSubmitResults() || this.authService.authLoading()) {
      return;
    }

    console.log('Quiz completed!', {
      name: this.name(),
      email: this.email(),
      answers: this.answers()
    });

    try {
      if (this.authMode() === 'signup') {
        const { firstName, lastName } = this.extractNames(this.name().trim());
        await this.authService.signUpWithEmail({
          firstName,
          lastName,
          email: this.email().trim(),
          password: this.password()
        });
      } else {
        await this.authService.signInWithEmail(this.email().trim(), this.password());
      }
      await this.router.navigateByUrl('/ai');
    } catch (error) {
      console.error('Quiz auth error:', error);
    }
  }

  restartQuiz() {
    this.currentStep.set(0);
    this.answers.set([]);
    this.currentAnswer.set('');
    this.showResults.set(false);
    this.email.set('');
    this.name.set('');
    this.password.set('');
    this.authMode.set('signup');
  }

  private extractNames(fullName: string) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return { firstName: 'Rocket', lastName: 'Member' };
    }
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ') || 'Member';
    return { firstName, lastName };
  }
}
