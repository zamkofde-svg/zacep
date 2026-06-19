-- Зацеп имеется — схема БД (MySQL 5.7+/8.0). Выполнить один раз в phpMyAdmin на reg.ru.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  tg_id        BIGINT UNIQUE,
  username     VARCHAR(64),
  first_name   VARCHAR(128),
  last_name    VARCHAR(128),
  real_name    VARCHAR(128),
  photo_url    VARCHAR(512),
  nick         VARCHAR(64),
  phone        VARCHAR(32),
  password_hash VARCHAR(255),
  onboarded    TINYINT(1) NOT NULL DEFAULT 0,
  is_admin     TINYINT(1) NOT NULL DEFAULT 0,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tournaments (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  title        VARCHAR(128) NOT NULL,
  format       ENUM('classic','bounty','guest') NOT NULL DEFAULT 'classic',
  starts_at    DATETIME NOT NULL,
  venue        VARCHAR(255) NOT NULL DEFAULT 'ТРЦ «Грин Хаус», Тюмень',
  buyin        INT NOT NULL DEFAULT 0,
  stack        INT NOT NULL DEFAULT 0,
  seats        INT NOT NULL DEFAULT 36,
  description  TEXT,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS registrations (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  tournament_id INT NOT NULL,
  status        ENUM('confirmed','waitlist','cancelled') NOT NULL DEFAULT 'confirmed',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_reg (user_id, tournament_id),
  CONSTRAINT fk_reg_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_reg_tour FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS results (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  tournament_id INT NOT NULL,
  place         INT,
  points        INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_res_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_res_tour FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_achievements (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  code       VARCHAR(40) NOT NULL,
  earned_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ach (user_id, code),
  CONSTRAINT fk_ach_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Демонстрационные турниры (можно удалить и завести свои)
INSERT INTO tournaments (title, format, starts_at, buyin, stack, seats, description) VALUES
  ('Классика', 'classic', DATE_ADD(CURDATE(), INTERVAL 2 DAY) + INTERVAL 19 HOUR, 1500, 20000, 36, 'Texas Hold''em NL. Стартовый стек 20 000, уровни по 20 минут.'),
  ('Баунти',   'bounty',  DATE_ADD(CURDATE(), INTERVAL 4 DAY) + INTERVAL 17 HOUR, 2500, 30000, 36, 'Knockout. За каждого выбитого +250 очков в рейтинг.'),
  ('Гостевой — бар «Коробок»', 'guest', DATE_ADD(CURDATE(), INTERVAL 6 DAY) + INTERVAL 18 HOUR, 1500, 25000, 27, 'Выездной турнир на партнёрской площадке. Очки идут в общий рейтинг.');
