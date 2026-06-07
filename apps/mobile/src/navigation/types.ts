export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type DriverTabParamList = {
  Home: undefined;
  Reservations: undefined;
  ActiveSessionTab: undefined;
  History: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  DriverTabs: undefined;
  ReservationDetail: { reservationId: string };
  QRCode: { sessionId: string };
  PaymentStatus: { sessionId?: string };
  NotificationCenter: undefined;
};
