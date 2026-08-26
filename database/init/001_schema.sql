CREATE DATABASE IF NOT EXISTS `wgg_wedding`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE `wgg_wedding`;

CREATE TABLE IF NOT EXISTS `guest_submissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(32) NOT NULL,
  `attendance` ENUM('yes', 'no', 'pending') NOT NULL DEFAULT 'pending',
  `guest_count` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `message` VARCHAR(1000) NULL,
  `is_confirmed` BOOLEAN NOT NULL DEFAULT FALSE,
  `confirmed_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_guest_submissions_created_at` (`created_at`),
  INDEX `idx_guest_submissions_attendance` (`attendance`),
  INDEX `idx_guest_submissions_is_confirmed` (`is_confirmed`),
  CONSTRAINT `chk_guest_count` CHECK (`guest_count` BETWEEN 1 AND 20)
) ENGINE=InnoDB;
