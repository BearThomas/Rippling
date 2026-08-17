/**
 * 提问箱 API（/api/question）
 */

import { apiGet, apiPost, apiPut, apiDelete } from "./client";
import type { QuestionBoxInfo, QuestionInfo } from "../types";

/** 查看某用户的提问箱（enabled 为 false 时不允许提问） */
export function getQuestionBox(ownerId: string): Promise<QuestionBoxInfo> {
  return apiGet<QuestionBoxInfo>("/api/question/box", { params: { ownerId } });
}

/** 更新自己的提问箱设置（enable_question_box 权限） */
export function updateQuestionBox(input: {
  enabled?: boolean;
  onlyFollowers?: boolean;
}): Promise<QuestionBoxInfo> {
  return apiPut<QuestionBoxInfo>("/api/question/box", input);
}

/** 向提问箱提问（ask_question 权限，可匿名由后端处理） */
export function askQuestion(boxOwnerId: string, content: string): Promise<QuestionInfo> {
  return apiPost<QuestionInfo>("/api/question", { boxOwnerId, content });
}

/** 查看某用户提问箱收到的问题（箱主查自己；游客查已回答部分） */
export function listQuestions(
  ownerId: string,
  limit = 50,
  offset = 0
): Promise<QuestionInfo[]> {
  return apiGet<QuestionInfo[]>("/api/question/list", {
    params: { ownerId, limit, offset },
  });
}

/** 回答问题（箱主） */
export function answerQuestion(questionId: string, answer: string): Promise<QuestionInfo> {
  return apiPost<QuestionInfo>("/api/question/answer", { questionId, answer });
}

/** 删除问题（箱主或提问人） */
export function deleteQuestion(questionId: string): Promise<void> {
  return apiDelete<void>("/api/question", { body: { questionId } });
}
