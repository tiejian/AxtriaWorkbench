var axtriaApp = angular.module('axtriaApp', ['ngRoute']);

// configure routes
axtriaApp.config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
  $routeProvider
    .when('/query', {
      templateUrl: '/pages/query.html'
    })
    .when('/report', {
      templateUrl: '/pages/report.html'
    })
    /*.when('/graph', {
      templateUrl: '/pages/graph.html',
      //controller: 'graphController'
    });*/
}]);

// create the controller and inject Angular's $scope
axtriaApp.controller('mainController', ['$scope', '$location', function($scope, $location) {
  $scope.inputData = {
    // default values
    srcTable: 'inpatient_services_table',
    xz: 3,
    monOrDay: 'month',
    gapDays: 45,
    indexDate: new Date(2012, 01, 01),
    minAge: 18,
    srcItems: ['inpatient_services_table', 'outpatient_services_table'],
    monItems: ['month', 'day'],
  };

  $scope.changeTable = function(item) {
    $scope.inputData.srcTable = item.value;
    //console.log($scope.inputData.srcTable);
  };
  $scope.changeMonOrDay = function(item) {
    $scope.inputData.monOrDay = item.value;
  }

  var socket = io.connect('http://localhost:3000');
  $scope.submitQuery = function() {
    // days of continuous enrollment
    let contDays = $scope.inputData.monOrDay === 'month' ? $scope.inputData.xz*30 : $scope.inputData.xz;
    let data = {
      contEnroll: contDays,
      indexDate: $scope.inputData.indexDate,
      adultYear: $scope.inputData.minAge,
      gapDays: $scope.inputData.gapDays,
      srcTable: $scope.inputData.srcTable,
    };
    alert(JSON.stringify(data));
    socket.emit('query', data);
  }

  socket.on('cohort', function(res) {
    //alert(data.length);
    $location.path('/report');
    $scope.cohort = res;
  });

  socket.on('kickout', function(res) {
    $location.path('/report');
    $scope.kickout = res;
  });
}]);

/*axtriaApp.controller('graphController', function($scope) {
  $scope.message = 'This message is from graphController';
});*/
