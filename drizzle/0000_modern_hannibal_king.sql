CREATE TABLE `memorization_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`idempotencyKey` varchar(200) NOT NULL,
	`sessionId` varchar(200) NOT NULL,
	`surah` int NOT NULL,
	`ayah` int NOT NULL,
	`attemptedAt` timestamp NOT NULL,
	`result` enum('completed','partial','corrected','uncertain') NOT NULL,
	`score` int NOT NULL,
	`matchedCount` int NOT NULL,
	`totalWords` int NOT NULL,
	`correctionWordIndexesJson` text NOT NULL,
	`errorsJson` text NOT NULL,
	`attemptsRequired` int NOT NULL,
	`eventuallyAdvanced` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `memorization_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `memorization_attempt_user_key_uq` UNIQUE(`userId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `qaida_lesson_completions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`lessonId` varchar(128) NOT NULL,
	`completedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `qaida_lesson_completions_id` PRIMARY KEY(`id`),
	CONSTRAINT `qaida_completion_user_lesson_uq` UNIQUE(`userId`,`lessonId`)
);
--> statement-breakpoint
CREATE TABLE `qaida_progress` (
	`userId` int NOT NULL,
	`currentLessonId` varchar(128) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `qaida_progress_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
-- `users` predates Drizzle migration snapshots in this repository. It is
-- intentionally not recreated here: this migration is additive-only.
ALTER TABLE `memorization_attempts` ADD CONSTRAINT `memorization_attempts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `qaida_lesson_completions` ADD CONSTRAINT `qaida_lesson_completions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `qaida_progress` ADD CONSTRAINT `qaida_progress_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `memorization_attempt_user_ayah_idx` ON `memorization_attempts` (`userId`,`surah`,`ayah`);--> statement-breakpoint
CREATE INDEX `qaida_completion_user_idx` ON `qaida_lesson_completions` (`userId`);
