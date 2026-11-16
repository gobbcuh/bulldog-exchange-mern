
import { useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import {
  authenticatedFetch,
  ApiError,
} from "../services/api";

export function useAuthenticatedApi() {
  const { token, handleUnauthorized } = useAuth();

  const request = useCallback(
    async (endpoint, options = {}) => {
      try {
        return await authenticatedFetch(
          endpoint,
          token,
          options
        );
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 401 &&
          token
        ) {
          handleUnauthorized(token);
        }

        throw error;
      }
    },
    [token, handleUnauthorized]
  );

  return request;
}
