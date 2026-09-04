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

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(64) NOT NULL,
  `password_hash` CHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `password_salt` CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `last_login_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `admin_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_sessions_token_hash` (`token_hash`),
  INDEX `idx_admin_sessions_expires_at` (`expires_at`),
  INDEX `idx_admin_sessions_user_id` (`user_id`),
  CONSTRAINT `fk_admin_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
