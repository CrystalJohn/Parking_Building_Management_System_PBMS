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
  Welcome: undefined;
  DriverTabs: undefined;
  ReservationDetail: { reservationId: string };
  NotificationCenter: undefined;
};
